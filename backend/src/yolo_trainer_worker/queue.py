"""The worker's view of the run queue: claim, progress writes, finish, registration.

The database is the queue (no Redis): the api inserts runs, this module claims the
oldest `queued` one with a single atomic UPDATE and writes every state change.
It uses a sync engine with the same SQLite pragmas as the api (`busy_timeout`,
`foreign_keys`, WAL) and keeps every write tiny and infrequent (Pitfall 7).
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import Engine, create_engine, event, exists, select, update
from sqlalchemy.orm import Session, aliased

from yolo_trainer_api.db import apply_sqlite_pragmas
from yolo_trainer_api.models import TrainedModel, TrainingRun, utcnow
from yolo_trainer_api.training.reconcile import RUNNING_INTERRUPTED_DETAIL
from yolo_trainer_api.training.snapshot import link_or_copy
from yolo_trainer_common import layout
from yolo_trainer_common.progress import jsonable, primary_metrics

if TYPE_CHECKING:
    from yolo_trainer_worker.main import WorkerSettings

logger = logging.getLogger(__name__)

INTERRUPTED_ON_RESTART_MESSAGE = RUNNING_INTERRUPTED_DETAIL
_HASH_CHUNK = 1024 * 1024


def create_worker_engine(settings: WorkerSettings) -> Engine:
    """A sync engine on the shared database file with the api's pragma tuning."""
    engine = create_engine(settings.sync_database_url)
    journal_mode = settings.sqlite_journal_mode

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        apply_sqlite_pragmas(dbapi_connection, journal_mode)

    return engine


def claim_next(engine: Engine, now: datetime | None = None) -> int | None:
    """Atomically move the oldest `queued` run to `running`; None when there is nothing to do.

    One UPDATE ... RETURNING that only succeeds while no run is `running` (D-11). Both
    subqueries select from aliases, so neither correlates to the UPDATE target.
    """
    stamp = now or utcnow()
    oldest = aliased(TrainingRun)
    other = aliased(TrainingRun)
    oldest_queued = (
        select(oldest.id).where(oldest.status == "queued").order_by(oldest.id).limit(1)
    ).scalar_subquery()
    something_running = exists().where(other.status == "running")
    statement = (
        update(TrainingRun)
        .where(TrainingRun.id == oldest_queued, ~something_running)
        .values(status="running", started_at=stamp, progress_updated_at=stamp)
        .returning(TrainingRun.id)
    )
    with engine.begin() as connection:
        return connection.execute(statement).scalar_one_or_none()


def reconcile_on_start(engine: Engine, now: datetime | None = None) -> int:
    """Every `running` run becomes `interrupted`; `queued` runs stay queued (D-13).

    Deliberately never signals the PID recorded on a run: after a container restart the PID
    namespace is new and that number may belong to an unrelated process.
    """
    stamp = now or utcnow()
    with engine.begin() as connection:
        result = connection.execute(
            update(TrainingRun)
            .where(TrainingRun.status == "running")
            .values(
                status="interrupted",
                finished_at=stamp,
                error_message=INTERRUPTED_ON_RESTART_MESSAGE,
            )
        )
        return result.rowcount


def load_run(engine: Engine, run_id: int) -> dict | None:
    """The fields the supervisor needs, or None when the run row is gone."""
    with Session(engine) as session:
        run = session.get(TrainingRun, run_id)
        if run is None:
            return None
        return {
            "id": run.id,
            "task_type": run.task_type,
            "settings": dict(run.settings),
            "class_names": list(run.class_names or []),
            "epochs": run.epochs,
        }


def run_status(engine: Engine, run_id: int) -> str | None:
    """The status of a run, or None when its row is gone: one tiny SELECT."""
    with engine.connect() as connection:
        return connection.execute(
            select(TrainingRun.status).where(TrainingRun.id == run_id)
        ).scalar_one_or_none()


def _update_running(engine: Engine, run_id: int, **values: object) -> int:
    """One UPDATE scoped to a `running` run; returns the number of rows changed."""
    with engine.begin() as connection:
        result = connection.execute(
            update(TrainingRun)
            .where(TrainingRun.id == run_id, TrainingRun.status == "running")
            .values(**values)
        )
        return result.rowcount


def record_start(engine: Engine, run_id: int, resolved: dict, pid: int) -> int:
    return _update_running(engine, run_id, resolved=resolved, worker_pid=pid)


def record_epoch(
    engine: Engine, run_id: int, epoch: int, epochs: int | None, map50: float | None
) -> int:
    values: dict[str, object] = {
        "epoch": epoch,
        "last_map50": map50,
        "progress_updated_at": utcnow(),
    }
    if epochs is not None:
        values["epochs"] = epochs
    return _update_running(engine, run_id, **values)


def mark_failed(engine: Engine, run_id: int, message: str, log_tail: str | None) -> int:
    return _update_running(
        engine,
        run_id,
        status="failed",
        error_message=message,
        log_tail=log_tail,
        finished_at=utcnow(),
    )


def mark_interrupted(engine: Engine, run_id: int, message: str, log_tail: str | None = None) -> int:
    return _update_running(
        engine,
        run_id,
        status="interrupted",
        error_message=message,
        log_tail=log_tail,
        finished_at=utcnow(),
    )


def _file_digest(path: Path) -> tuple[int, str]:
    """Size and sha256 of a file, streamed."""
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while chunk := handle.read(_HASH_CHUNK):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def register_model(
    engine: Engine, data_dir: Path, run_id: int, result: dict, final_metrics: dict
) -> int:
    """Register `best.pt` as a model and complete the run, all in ONE transaction (D-16).

    The model file is linked (copied when linking fails) while the transaction is open,
    so the model row is never visible before its file exists; any failure rolls the rows
    back and removes the file again. `last.pt` is deliberately not registered.
    """
    best = layout.best_weights(layout.run_dir(data_dir, run_id))
    size_bytes, sha256 = _file_digest(best)
    metrics = jsonable(final_metrics)
    if not isinstance(metrics, dict):
        metrics = {}
    created: Path | None = None
    try:
        with Session(engine) as session:
            run = session.get(TrainingRun, run_id)
            if run is None or run.status != "running":
                raise RuntimeError("The run is no longer running.")
            headline = primary_metrics(run.task_type, metrics)
            model = TrainedModel(
                project_id=run.project_id,
                source_run_id=run.id,
                name=run.name,
                task_type=run.task_type,
                source="trained",
                class_names=list(run.class_names or []),
                metrics=metrics,
                precision=headline["precision"],
                recall=headline["recall"],
                map50=headline["map50"],
                map50_95=headline["map50_95"],
                base_name=run.base_name,
                size_bytes=size_bytes,
                sha256=sha256,
                ultralytics_version=result.get("ultralytics_version"),
                created_at=utcnow(),
            )
            session.add(model)
            session.flush()
            target = layout.model_file(data_dir, model.id)
            target.parent.mkdir(parents=True, exist_ok=True)
            created = target  # set first: a failed copy may leave a partial file to remove
            link_or_copy(best, target)
            changed = session.execute(
                update(TrainingRun)
                .where(TrainingRun.id == run_id, TrainingRun.status == "running")
                .values(
                    status="completed",
                    finished_at=utcnow(),
                    metrics=metrics,
                    last_map50=headline["map50"]
                    if headline["map50"] is not None
                    else run.last_map50,
                    error_message=None,
                )
                .execution_options(synchronize_session=False)
            ).rowcount
            if changed != 1:
                raise RuntimeError("The run is no longer running.")
            model_id = model.id
            session.commit()
            return model_id
    except BaseException:
        if created is not None:
            created.unlink(missing_ok=True)
        raise
