"""The run queue: strict FIFO, one running run at a time, a restart sweep that signals nobody.

Real app and database (TestClient over a temp-file SQLite database); the queue functions are
called directly with sync engines on that file (TRAN-04, D-11, D-13).
"""

from __future__ import annotations

import os
import threading

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
