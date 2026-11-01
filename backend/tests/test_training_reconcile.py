"""The api startup sweep: preparing runs fail, running runs are interrupted only when the
worker is gone (D-13).

Each test seeds state through one app instance, closes it, and starts a second instance on
the same `DATA_DIR`: the second lifespan is the "restart" under test.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainingRun, utcnow
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


def _request_cancel(settings: Settings, run_id: int) -> None:
    engine = queue.create_worker_engine(worker_settings(settings))
    with engine.begin() as connection:
        connection.execute(
            update(TrainingRun).where(TrainingRun.id == run_id).values(cancel_requested_at=utcnow())
        )
    engine.dispose()


def test_a_running_run_with_a_pending_cancel_and_a_stale_heartbeat_becomes_cancelled(
    settings: Settings,
) -> None:
    _, run_id = _seed_run(settings, "running")
    _request_cancel(settings, run_id)
    _write_heartbeat(settings, age_seconds=120)

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert run.status == "cancelled"
    assert run.finished_at is not None
    assert run.error_message is None


def test_a_running_run_with_a_pending_cancel_and_no_heartbeat_becomes_cancelled(
    settings: Settings,
) -> None:
    _, run_id = _seed_run(settings, "running")
    _request_cancel(settings, run_id)

    with make_client(settings):
        pass

    assert _row(settings, run_id).status == "cancelled"


def test_a_pending_cancel_does_not_end_a_run_whose_worker_is_still_alive(
    settings: Settings,
) -> None:
    _, run_id = _seed_run(settings, "running")
    _request_cancel(settings, run_id)
    _write_heartbeat(settings, age_seconds=5)

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert run.status == "running"  # the live worker stops its own child
    assert run.cancel_requested_at is not None


def test_queued_and_completed_runs_are_left_alone_and_the_messages_are_shared(
    settings: Settings,
) -> None:
    _, queued_id = _seed_run(settings, None)

    with make_client(settings):
        pass

    assert _row(settings, queued_id).status == "queued"
    assert queue.INTERRUPTED_ON_RESTART_MESSAGE == reconcile.RUNNING_INTERRUPTED_DETAIL


def _seed_segment(
    settings: Settings,
    run_id: int,
    *,
    active: float,
    segment: datetime | None,
    progress: datetime | None,
) -> None:
    engine = queue.create_worker_engine(worker_settings(settings))
    with engine.begin() as connection:
        connection.execute(
            update(TrainingRun)
            .where(TrainingRun.id == run_id)
            .values(active_seconds=active, segment_started_at=segment, progress_updated_at=progress)
        )
    engine.dispose()


def test_the_api_sweep_adds_the_last_known_running_time_of_the_segment(
    settings: Settings,
) -> None:
    _, run_id = _seed_run(settings, "running")
    start = datetime(2026, 10, 11, 10, 0, 0, tzinfo=UTC)
    _seed_segment(
        settings, run_id, active=10, segment=start, progress=start + timedelta(seconds=30)
    )

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert run.status == "interrupted"
    assert run.active_seconds == 40.0
    assert run.segment_started_at is None


def test_the_api_sweep_adds_the_segment_to_a_cancelled_run_too(settings: Settings) -> None:
    _, run_id = _seed_run(settings, "running")
    start = datetime(2026, 10, 11, 10, 0, 0, tzinfo=UTC)
    _seed_segment(settings, run_id, active=5, segment=start, progress=start + timedelta(minutes=1))
    _request_cancel(settings, run_id)

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert run.status == "cancelled"
    assert run.active_seconds == 65.0
    assert run.segment_started_at is None


def test_the_api_sweep_adds_nothing_without_a_segment_start_or_a_progress_stamp(
    settings: Settings,
) -> None:
    _, run_id = _seed_run(settings, "running")
    _seed_segment(settings, run_id, active=3, segment=None, progress=None)

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert (run.status, run.active_seconds, run.segment_started_at) == ("interrupted", 3.0, None)


def test_a_live_worker_keeps_its_open_segment_on_an_api_only_restart(settings: Settings) -> None:
    _, run_id = _seed_run(settings, "running")
    start = datetime(2026, 10, 11, 10, 0, 0, tzinfo=UTC)
    _seed_segment(settings, run_id, active=10, segment=start, progress=start)
    _write_heartbeat(settings, age_seconds=5)

    with make_client(settings):
        pass

    run = _row(settings, run_id)
    assert (run.status, run.active_seconds) == ("running", 10.0)
    assert run.segment_started_at is not None
