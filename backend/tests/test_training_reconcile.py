"""The api startup sweep: preparing runs fail, running runs are interrupted only when the
worker is gone (D-13).

Each test seeds state through one app instance, closes it, and starts a second instance on
the same `DATA_DIR`: the second lifespan is the "restart" under test.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import reconcile
from yolo_trainer_common import layout
from yolo_trainer_worker import queue

from .conftest import make_client
from .training_helpers import setup_project, start_run, wait_status, worker_settings


def _seed_run(settings: Settings, status: str | None) -> tuple[int, int]:
    """One queued run (project id, run id), optionally forced into another status."""
    with make_client(settings) as client:
        ids = setup_project(client, "Restart", train=1, valid=1)
        run = start_run(client, ids["project_id"])
        wait_status(client, ids["project_id"], run["id"], {"queued"})
    if status is not None:
        engine = queue.create_worker_engine(worker_settings(settings))
        with engine.begin() as connection:
            connection.execute(
                update(TrainingRun).where(TrainingRun.id == run["id"]).values(status=status)
            )
        engine.dispose()
    return ids["project_id"], run["id"]


def _write_heartbeat(settings: Settings, age_seconds: float) -> None:
    stamp = datetime.now(UTC) - timedelta(seconds=age_seconds)
    layout.write_json_atomic(
        layout.heartbeat_file(settings.data_dir),
        {"pid": 1, "last_heartbeat": stamp.isoformat().replace("+00:00", "Z")},
    )


def _row(settings: Settings, run_id: int) -> TrainingRun:
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        with Session(engine) as session:
            run = session.get(TrainingRun, run_id)
            session.expunge(run)
            return run
    finally:
        engine.dispose()


def test_a_preparing_run_fails_and_loses_its_folder_on_api_start(settings: Settings) -> None:
    _, run_id = _seed_run(settings, "preparing")
    folder = layout.run_dir(settings.data_dir, run_id)
    assert folder.exists()

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert run.status == "failed"
    assert (
        run.error_message
        == "Dataset preparation was interrupted by a restart. Start the run again."
    )
    assert run.finished_at is not None
    assert not folder.exists()


def test_a_running_run_without_a_heartbeat_is_interrupted_on_api_start(settings: Settings) -> None:
    _, run_id = _seed_run(settings, "running")

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert run.status == "interrupted"
    assert run.error_message == "The service was restarted while this run was training."
    assert run.finished_at is not None


def test_a_running_run_with_a_fresh_heartbeat_survives_an_api_only_restart(
    settings: Settings,
) -> None:
    _, run_id = _seed_run(settings, "running")
    _write_heartbeat(settings, age_seconds=5)

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert run.status == "running"
    assert run.finished_at is None
    assert layout.run_dir(settings.data_dir, run_id).exists()


def test_a_running_run_with_a_stale_heartbeat_is_interrupted_on_api_start(
    settings: Settings,
) -> None:
    _, run_id = _seed_run(settings, "running")
    _write_heartbeat(settings, age_seconds=120)

    with make_client(settings):
        pass

    assert _row(settings, run_id).status == "interrupted"


def test_queued_and_completed_runs_are_left_alone_and_the_messages_are_shared(
    settings: Settings,
) -> None:
    _, queued_id = _seed_run(settings, None)

    with make_client(settings):
        pass

    assert _row(settings, queued_id).status == "queued"
    assert queue.INTERRUPTED_ON_RESTART_MESSAGE == reconcile.RUNNING_INTERRUPTED_DETAIL
