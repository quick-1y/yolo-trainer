"""The run queue: strict FIFO, one running run at a time, a restart sweep that signals nobody.

Real app and database (TestClient over a temp-file SQLite database); the queue functions are
called directly with sync engines on that file (TRAN-04, D-11, D-13).
"""

from __future__ import annotations

import os
import threading
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select, update
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainingRun, utcnow
from yolo_trainer_api.settings import Settings
from yolo_trainer_worker import queue

from .training_helpers import setup_project, start_run, wait_status, worker_settings


def _queued_runs(client: TestClient, count_per_project: tuple[int, ...]) -> list[int]:
    """Start runs in the order given: project index per run; returns the run ids."""
    projects = [
        setup_project(client, f"Queue {index}", train=1, valid=1)["project_id"]
        for index in range(max(count_per_project) + 1)
    ]
    ids = []
    for project_index in count_per_project:
        run = start_run(client, projects[project_index])
        ids.append(run["id"])
    for project_index, run_id in zip(count_per_project, ids, strict=True):
        wait_status(client, projects[project_index], run_id, {"queued"})
    return ids


def _set_status(engine: Engine, run_id: int, status: str) -> None:
    with engine.begin() as connection:
        connection.execute(
            update(TrainingRun).where(TrainingRun.id == run_id).values(status=status)
        )


def _status(engine: Engine, run_id: int) -> str:
    with Session(engine) as session:
        return session.scalar(select(TrainingRun.status).where(TrainingRun.id == run_id))


def test_claim_next_is_fifo_across_projects_and_waits_while_a_run_is_running(
    client: TestClient, settings: Settings
) -> None:
    first, second, third = _queued_runs(client, (0, 1, 0))
    engine = queue.create_worker_engine(worker_settings(settings))

    assert queue.claim_next(engine) == first
    assert queue.claim_next(engine) is None  # one at a time, even across projects
    _set_status(engine, first, "completed")
    assert queue.claim_next(engine) == second
    assert queue.claim_next(engine) is None
    _set_status(engine, second, "failed")
    assert queue.claim_next(engine) == third
    _set_status(engine, third, "interrupted")
    assert queue.claim_next(engine) is None


def test_two_workers_claiming_at_once_get_exactly_one_run(
    client: TestClient, settings: Settings
) -> None:
    (only,) = _queued_runs(client, (0,))
    engines = [queue.create_worker_engine(worker_settings(settings)) for _ in range(2)]
    barrier = threading.Barrier(2)
    claimed: list[int | None] = []

    def claim(engine: Engine) -> None:
        barrier.wait()
        claimed.append(queue.claim_next(engine))

    threads = [threading.Thread(target=claim, args=(engine,)) for engine in engines]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(claimed, key=lambda value: (value is None, value)) == [only, None]
    assert _status(engines[0], only) == "running"


def test_reconcile_on_start_interrupts_running_runs_without_signalling_any_pid(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    running, waiting, finished = _queued_runs(client, (0, 0, 0))
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == running
    with engine.begin() as connection:  # a recorded PID that now may belong to anyone
        connection.execute(
            update(TrainingRun).where(TrainingRun.id == running).values(worker_pid=os.getpid())
        )
    _set_status(engine, finished, "completed")

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("reconcile_on_start must never signal a process")

    monkeypatch.setattr(os, "kill", forbidden)
    monkeypatch.setattr(os, "killpg", forbidden, raising=False)

    assert queue.reconcile_on_start(engine) == 1

    with Session(engine) as session:
        interrupted = session.get(TrainingRun, running)
        assert interrupted.status == "interrupted"
        assert interrupted.error_message == "The service was restarted while this run was training."
        assert interrupted.finished_at is not None
    assert _status(engine, waiting) == "queued"
    assert _status(engine, finished) == "completed"
    assert queue.claim_next(engine) == waiting  # queued runs are claimed in order afterwards


def _request_cancel(engine: Engine, run_id: int) -> None:
    with engine.begin() as connection:
        connection.execute(
            update(TrainingRun).where(TrainingRun.id == run_id).values(cancel_requested_at=utcnow())
        )


def test_reconcile_on_start_cancels_a_running_run_with_a_pending_cancel_and_interrupts_the_rest(
    client: TestClient, settings: Settings
) -> None:
    cancelling, plain = _queued_runs(client, (0, 0))
    engine = queue.create_worker_engine(worker_settings(settings))
    _set_status(engine, cancelling, "running")
    _set_status(engine, plain, "running")
    _request_cancel(engine, cancelling)

    assert queue.reconcile_on_start(engine) == 2

    with Session(engine) as session:
        cancelled = session.get(TrainingRun, cancelling)
        assert cancelled.status == "cancelled"
        assert cancelled.finished_at is not None
        assert cancelled.error_message is None
        assert cancelled.error_category is None
        interrupted = session.get(TrainingRun, plain)
        assert interrupted.status == "interrupted"
        assert interrupted.error_message == "The service was restarted while this run was training."


def test_run_control_reports_the_status_and_the_flag_and_none_for_a_missing_run(
    client: TestClient, settings: Settings
) -> None:
    (run_id,) = _queued_runs(client, (0,))
    engine = queue.create_worker_engine(worker_settings(settings))

    assert queue.run_control(engine, run_id) == ("queued", None)
    _set_status(engine, run_id, "running")
    _request_cancel(engine, run_id)
    status, requested_at = queue.run_control(engine, run_id)
    assert status == "running"
    assert requested_at is not None
    assert queue.run_control(engine, 9999) == (None, None)


def test_mark_cancelled_ends_only_a_running_run_without_error_fields(
    client: TestClient, settings: Settings
) -> None:
    running, done = _queued_runs(client, (0, 0))
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == running
    _set_status(engine, done, "completed")

    assert queue.mark_cancelled(engine, done, "tail") == 0  # a finished run is never rewritten
    assert queue.mark_cancelled(engine, running, "last lines") == 1

    with Session(engine) as session:
        assert session.get(TrainingRun, done).status == "completed"
        cancelled = session.get(TrainingRun, running)
        assert cancelled.status == "cancelled"
        assert cancelled.finished_at is not None
        assert cancelled.error_message is None
        assert cancelled.error_category is None
        assert cancelled.log_tail == "last lines"
    assert queue.mark_cancelled(engine, running, "again") == 0  # idempotent: already cancelled


def _set_queued_at(engine: Engine, run_id: int, stamp: datetime | None) -> None:
    with engine.begin() as connection:
        connection.execute(
            update(TrainingRun).where(TrainingRun.id == run_id).values(queued_at=stamp)
        )


def test_claim_next_orders_by_when_a_run_became_queued_then_by_id(
    client: TestClient, settings: Settings
) -> None:
    resumed, first, second = _queued_runs(client, (0, 0, 0))  # ids ascend in this order
    engine = queue.create_worker_engine(worker_settings(settings))
    day = datetime(2026, 10, 11, tzinfo=UTC)
    _set_queued_at(engine, first, day.replace(hour=10, minute=0))
    _set_queued_at(engine, second, day.replace(hour=10, minute=5))
    _set_queued_at(engine, resumed, day.replace(hour=10, minute=10))  # oldest id, resumed last

    claimed = []
    for _ in range(3):
        run_id = queue.claim_next(engine)
        claimed.append(run_id)
        _set_status(engine, run_id, "completed")

    assert claimed == [first, second, resumed]


def test_claim_next_falls_back_to_created_at_for_rows_without_queued_at(
    client: TestClient, settings: Settings
) -> None:
    older, newer = _queued_runs(client, (0, 0))
    engine = queue.create_worker_engine(worker_settings(settings))
    _set_queued_at(engine, older, None)
    _set_queued_at(engine, newer, None)

    assert queue.claim_next(engine) == older
    _set_status(engine, older, "completed")
    assert queue.claim_next(engine) == newer


def test_record_checkpoint_sets_and_clears_the_resume_epoch_of_a_running_run_only(
    client: TestClient, settings: Settings
) -> None:
    running, waiting = _queued_runs(client, (0, 0))
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == running

    assert queue.record_checkpoint(engine, running, 3) == 1
    with Session(engine) as session:
        assert session.get(TrainingRun, running).resume_epoch == 3
    assert queue.record_checkpoint(engine, running, None) == 1
    assert queue.record_checkpoint(engine, waiting, 1) == 0  # a queued run is never written
    with Session(engine) as session:
        assert session.get(TrainingRun, running).resume_epoch is None
        assert session.get(TrainingRun, waiting).resume_epoch is None


def test_load_run_reports_the_resume_count_the_stored_resolution_and_the_active_seconds(
    client: TestClient, settings: Settings
) -> None:
    (run_id,) = _queued_runs(client, (0,))
    engine = queue.create_worker_engine(worker_settings(settings))

    fresh = queue.load_run(engine, run_id)
    assert (fresh["resume_count"], fresh["resolved"], fresh["active_seconds"]) == (0, None, 0)

    assert queue.claim_next(engine) == run_id
    queue.record_start(engine, run_id, {"device": "cpu", "batch": 2, "workers": 0}, 123)
    stored = queue.load_run(engine, run_id)
    assert stored["resolved"] == {"device": "cpu", "batch": 2, "workers": 0}
