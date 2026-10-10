"""Training run service: create a run with its snapshot, prepare its files, read runs.

`create_run` makes the run INSERT the first write of its transaction and captures
the dataset in that same transaction (D-20). The files are materialized afterwards
by `prepare_run_files`, outside the request, and only then does the run become
`queued` for the worker.
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from yolo_trainer_api import storage
from yolo_trainer_api.models import (
    Project,
    TrainedModel,
    TrainingRun,
    normalize_project_name,
    utcnow,
)
from yolo_trainer_api.schemas import (
    DatasetCounts,
    OfficialBase,
    RunBase,
    RunCreate,
    RunMetrics,
    RunModelRef,
    RunRead,
    RunResolved,
    RunSettings,
    RunSummary,
)
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training.catalog import is_official
from yolo_trainer_api.training.snapshot import (
    Snapshot,
    SnapshotSourceMissing,
    capture_snapshot,
    materialize,
)
from yolo_trainer_common import layout
from yolo_trainer_common.progress import primary_metrics

logger = logging.getLogger(__name__)

RUN_NOT_FOUND_DETAIL = "Run not found."
RUN_NOT_QUEUED_DETAIL = "This run has already started and can no longer be removed from the queue."
NO_CLASSES_DETAIL = "Add at least one class before training."
TRAIN_EMPTY_DETAIL = "No annotated images are assigned to Train."
VALID_EMPTY_DETAIL = "No annotated images are assigned to Valid."
BASE_TASK_MISMATCH_DETAIL = "This model does not match the project's task type."
UNKNOWN_MODEL_DETAIL = "Unknown model."
MODEL_TASK_MISMATCH_DETAIL = "This model was trained for a different task type."
MODEL_FILE_MISSING_DETAIL = "The model file is missing."
PREPARE_SOURCE_MISSING_DETAIL = (
    "An image was deleted while the dataset was being prepared. Start the run again."
)

_DOWNLOAD_NAME_MAX = 120
_DOWNLOAD_SUFFIX = "_best.pt"
_UNSAFE_FILENAME_CHARS = re.compile(r"[^\w.\-]")


async def next_run_name(session: AsyncSession, project_id: int) -> str:
    """`run-<n>` for the smallest n >= 1 whose normalized name is free in the project."""
    taken = set(
        (
            await session.execute(
                select(TrainingRun.normalized_name).where(TrainingRun.project_id == project_id)
            )
        ).scalars()
    )
    number = 1
    while f"run-{number}" in taken:
        number += 1
    return f"run-{number}"


BLOCKER_DETAILS = {
    "noClasses": NO_CLASSES_DETAIL,
    "trainEmpty": TRAIN_EMPTY_DETAIL,
    "validEmpty": VALID_EMPTY_DETAIL,
}


def blocker_codes(class_count: int, train_used: int, valid_used: int) -> list[str]:
    """The reasons a run cannot start, in the order they are reported (D-05).

    One rule for the form (`GET .../training/options`) and for the refusal of
    `POST .../runs`, so the UI and the API never disagree. Test may stay empty.
    """
    codes = []
    if class_count == 0:
        codes.append("noClasses")
    if train_used == 0:
        codes.append("trainEmpty")
    if valid_used == 0:
        codes.append("validEmpty")
    return codes


async def _resolve_base(
    session: AsyncSession, settings: Settings, task_type: str, base: RunBase
) -> tuple[str, str, int | None]:
    """`(base_kind, base_name, base_model_id)` of an accepted base, else a 422.

    A model base is a row of the `models` table whose file lives at an id-derived path
    below `data/models`; no client-supplied path is ever read (T4-01, T4-08-01).
    """
    if isinstance(base, OfficialBase):
        if not is_official(base.name, task_type):
            raise HTTPException(status_code=422, detail=BASE_TASK_MISMATCH_DETAIL)
        return "official", base.name, None
    model = (
        await session.execute(select(TrainedModel).where(TrainedModel.id == base.model_id))
    ).scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=422, detail=UNKNOWN_MODEL_DETAIL)
    if model.task_type != task_type:
        raise HTTPException(status_code=422, detail=MODEL_TASK_MISMATCH_DETAIL)
    model_id, model_name = model.id, model.name
    if not await asyncio.to_thread(layout.model_file(settings.data_dir, model_id).is_file):
        raise HTTPException(status_code=422, detail=MODEL_FILE_MISSING_DETAIL)
    return "model", model_name, model_id


async def create_run(
    session: AsyncSession, project: Project, payload: RunCreate, settings: Settings
) -> tuple[TrainingRun, Snapshot]:
    """Insert a `preparing` run and capture its dataset in the same transaction.

    The INSERT is the first write, so the SQLite write lock is taken before the
    snapshot reads and they see one consistent state (Pitfall 8). Every refusal
    rolls the whole transaction back, which leaves no run row behind.
    """
    project_id, task_type = project.id, project.task_type
    base_kind, base_name, base_model_id = await _resolve_base(
        session, settings, task_type, payload.base
    )

    name = payload.name or await next_run_name(session, project_id)
    normalized_name = normalize_project_name(name)
    run_settings = {
        "epochs": payload.epochs,
        "imgsz": payload.imgsz,
        "batch": payload.batch,
        "device": payload.device,
    }
    run = TrainingRun(
        project_id=project_id,
        name=name,
        normalized_name=normalized_name,
        status="preparing",
        task_type=task_type,
        base_kind=base_kind,
        base_name=base_name,
        base_model_id=base_model_id,
        settings=run_settings,
        epochs=payload.epochs,
        created_at=utcnow(),
    )
    session.add(run)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        # Quote the ALREADY-STORED name: the attempt may differ only by case (D-10).
        stored_name = (
            await session.execute(
                select(TrainingRun.name).where(
                    TrainingRun.project_id == project_id,
                    TrainingRun.normalized_name == normalized_name,
                )
            )
        ).scalar_one_or_none()
        if stored_name is None:
            # Not a name clash: the chosen model was deleted after it was checked.
            raise HTTPException(status_code=422, detail=UNKNOWN_MODEL_DETAIL) from None
        raise HTTPException(
            status_code=409, detail=f'A run named "{stored_name}" already exists in this project.'
        ) from None

    snapshot_settings = {
        "base": {"kind": base_kind, "name": base_name, "model_id": base_model_id},
        **run_settings,
    }
    snapshot = await capture_snapshot(session, project_id, run.id, task_type, snapshot_settings)
    counts = snapshot.usable_counts()
    blockers = blocker_codes(len(snapshot.classes), counts["train"], counts["valid"])
    if blockers:
        await session.rollback()
        raise HTTPException(status_code=422, detail=BLOCKER_DETAILS[blockers[0]])

    run.dataset_counts = counts
    run.class_names = [item.name for item in snapshot.classes]
    await session.commit()
    return run, snapshot


async def _set_failed(
    sessionmaker: async_sessionmaker[AsyncSession], run_id: int, message: str
) -> None:
    async with sessionmaker() as session:
        await session.execute(
            update(TrainingRun)
            .where(TrainingRun.id == run_id, TrainingRun.status == "preparing")
            .values(status="failed", error_message=message, finished_at=utcnow())
        )
        await session.commit()


async def _remove_folder(settings: Settings, run_id: int) -> None:
    try:
        await asyncio.to_thread(storage.remove_run_dir, settings, run_id)
    except Exception:
        logger.exception("Could not remove the folder of run %s", run_id)


async def prepare_run_files(
    sessionmaker: async_sessionmaker[AsyncSession], settings: Settings, snapshot: Snapshot
) -> None:
    """Materialize the dataset, then flip the run from `preparing` to `queued`.

    Runs as a background task after the 201 response. A vanished source image or any
    other error fails the run with a plain message and removes the half-built folder.
    """
    run_id = snapshot.run_id
    try:
        await asyncio.to_thread(materialize, settings.data_dir, snapshot)
    except SnapshotSourceMissing:
        await _set_failed(sessionmaker, run_id, PREPARE_SOURCE_MISSING_DETAIL)
        await _remove_folder(settings, run_id)
        return
    except Exception as exc:
        logger.exception("Could not prepare the dataset of run %s", run_id)
        await _set_failed(sessionmaker, run_id, f"Could not prepare the dataset: {exc}")
        await _remove_folder(settings, run_id)
        return

    async with sessionmaker() as session:
        result = await session.execute(
            update(TrainingRun)
            .where(TrainingRun.id == run_id, TrainingRun.status == "preparing")
            .values(status="queued")
        )
        await session.commit()
    if result.rowcount == 0:
        # The run was removed or failed while its files were being written.
        await _remove_folder(settings, run_id)


async def queue_positions(session: AsyncSession) -> dict[int, int]:
    """1-based FIFO position of every queued run, across all projects (D-11)."""
    ids = (
        await session.execute(
            select(TrainingRun.id).where(TrainingRun.status == "queued").order_by(TrainingRun.id)
        )
    ).scalars()
    return {run_id: position for position, run_id in enumerate(ids, start=1)}


async def remove_queued_run(
    session: AsyncSession, settings: Settings, project_id: int, run_id: int
) -> None:
    """Take a `queued` run out of the queue (D-11); anything else is refused with 409.

    One DELETE guarded by `status = 'queued'` races the worker's claim, which is one
    UPDATE guarded by the same condition, so exactly one of the two can win. The row goes
    first and the files after; a leftover folder is swept by the startup cleanup.
    """
    result = await session.execute(
        delete(TrainingRun).where(
            TrainingRun.id == run_id,
            TrainingRun.project_id == project_id,
            TrainingRun.status == "queued",
        )
    )
    await session.commit()
    if result.rowcount == 0:
        exists = (
            await session.execute(
                select(TrainingRun.id).where(
                    TrainingRun.id == run_id, TrainingRun.project_id == project_id
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(status_code=404, detail=RUN_NOT_FOUND_DETAIL)
        raise HTTPException(status_code=409, detail=RUN_NOT_QUEUED_DETAIL)
    await _remove_folder(settings, run_id)


def model_download_name(project_name: str | None, model_name: str) -> str:
    """`<project>_<run>_best.pt` reduced to safe filename characters (D-18, Pattern 8).

    NFKC, every character outside Unicode word characters, `.` and `-` becomes `_`,
    leading dots are stripped and the stem is cut so the whole name stays within 120.
    """
    stem = f"{project_name}_{model_name}" if project_name else model_name
    stem = unicodedata.normalize("NFKC", stem)
    stem = _UNSAFE_FILENAME_CHARS.sub("_", stem).lstrip(".")
    stem = stem[: _DOWNLOAD_NAME_MAX - len(_DOWNLOAD_SUFFIX)] or "model"
    return f"{stem}{_DOWNLOAD_SUFFIX}"


def _model_ref(model: TrainedModel, project_name: str | None) -> RunModelRef:
    return RunModelRef(
        id=model.id,
        file_name=model_download_name(project_name, model.name),
        size_bytes=model.size_bytes,
        ultralytics_version=model.ultralytics_version,
    )


def _summary_fields(
    run: TrainingRun, queue_position: int | None, model: RunModelRef | None
) -> dict:
    metrics = primary_metrics(run.task_type, run.metrics) if run.metrics else None
    return {
        "id": run.id,
        "project_id": run.project_id,
        "name": run.name,
        "status": run.status,
        "queue_position": queue_position,
        "task_type": run.task_type,
        "base_kind": run.base_kind,
        "base_name": run.base_name,
        "epoch": run.epoch,
        "epochs": run.epochs,
        "last_map50": run.last_map50,
        "map50": metrics["map50"] if metrics else None,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "model": model,
    }


async def run_summaries(session: AsyncSession, project_id: int) -> list[RunSummary]:
    """The project's runs, newest first, each with its model reference when it has one."""
    runs = list(
        (
            await session.execute(
                select(TrainingRun)
                .where(TrainingRun.project_id == project_id)
                .order_by(TrainingRun.id.desc())
            )
        ).scalars()
    )
    if not runs:
        return []
    positions = await queue_positions(session)
    project_name = (
        await session.execute(select(Project.name).where(Project.id == project_id))
    ).scalar_one_or_none()
    models = {
        model.source_run_id: model
        for model in (
            await session.execute(
                select(TrainedModel).where(TrainedModel.source_run_id.in_([run.id for run in runs]))
            )
        ).scalars()
    }
    return [
        RunSummary(
            **_summary_fields(
                run,
                positions.get(run.id),
                _model_ref(models[run.id], project_name) if run.id in models else None,
            )
        )
        for run in runs
    ]


async def run_read(session: AsyncSession, run: TrainingRun) -> RunRead:
    """The full read model of one run."""
    positions = await queue_positions(session) if run.status == "queued" else {}
    project_name = (
        await session.execute(select(Project.name).where(Project.id == run.project_id))
    ).scalar_one_or_none()
    model = (
        await session.execute(select(TrainedModel).where(TrainedModel.source_run_id == run.id))
    ).scalar_one_or_none()
    metrics = RunMetrics(**primary_metrics(run.task_type, run.metrics)) if run.metrics else None
    return RunRead(
        **_summary_fields(
            run,
            positions.get(run.id),
            _model_ref(model, project_name) if model is not None else None,
        ),
        settings=RunSettings(**run.settings),
        resolved=RunResolved(**run.resolved) if run.resolved else None,
        dataset_counts=DatasetCounts(**run.dataset_counts) if run.dataset_counts else None,
        class_names=run.class_names,
        metrics=metrics,
        error_message=run.error_message,
        log_tail=run.log_tail,
    )
