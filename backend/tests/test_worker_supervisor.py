"""The supervisor's endings: stopped, vanished, failed, crashed and unregistrable runs.

The real supervisor and queue run against the real app database; only the training
command is the fake trainer (`fake_train_job.py`). Every ending must leave an honest final
status, and no ending may leave the child process running (TRAN-04, D-13, D-15, T4-05-01).
"""

from __future__ import annotations

import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel, TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_worker import queue
from yolo_trainer_worker import supervisor as supervisor_module
from yolo_trainer_worker.supervisor import STOPPED_MESSAGE, Supervisor

from .training_helpers import (
    fake_command,
    setup_project,
    start_run,
    wait_status,
    worker_settings,
)

ESC = chr(27)


class _Spawned:
    """Remembers every child the supervisor starts, so a test can prove it exited."""

    def __init__(self) -> None:
        self.processes: list[subprocess.Popen] = []

    def install(self, monkeypatch: pytest.MonkeyPatch) -> None:
        real_popen = subprocess.Popen
        spawned = self

        class RecordingPopen(real_popen):
            def __init__(self, *args: object, **kwargs: object) -> None:
                super().__init__(*args, **kwargs)
                spawned.processes.append(self)

        monkeypatch.setattr(supervisor_module.subprocess, "Popen", RecordingPopen)

    def all_exited(self) -> bool:
        return bool(self.processes) and all(
            process.poll() is not None for process in self.processes
        )


def _claimed_run(
    client: TestClient, settings: Settings, mode: str
) -> tuple[Supervisor, Engine, int, int]:
    """A project with one queued run, claimed, plus a supervisor driving the fake trainer."""
    ids = setup_project(client, "Supervised", train=2, valid=1)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command(mode),
        tick_seconds=0.05,
    )
    assert queue.claim_next(engine) == run["id"]
    return supervisor, engine, ids["project_id"], run["id"]


def _in_thread(function: Callable[[], object]) -> tuple[threading.Thread, list[object]]:
    outcome: list[object] = []

    def target() -> None:
        try:
            outcome.append(function())
        except BaseException as exc:  # surfaced to the asserting test
            outcome.append(exc)

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    return thread, outcome


def _wait_until(condition: Callable[[], bool], timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "condition not reached in time"
        time.sleep(0.05)


def _epoch_of(client: TestClient, project_id: int, run_id: int) -> int | None:
    return client.get(f"/api/projects/{project_id}/runs/{run_id}").json()["epoch"]


def test_a_stop_signal_interrupts_the_run_and_ends_the_child_within_the_grace_period(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    spawned = _Spawned()
    spawned.install(monkeypatch)
    supervisor, _, project_id, run_id = _claimed_run(client, settings, "sleep")
    stop_event = threading.Event()
    thread, outcome = _in_thread(lambda: supervisor.run_claimed(run_id, stop_event))
    _wait_until(lambda: _epoch_of(client, project_id, run_id) == 1)

    stop_event.set()
    started = time.monotonic()
    thread.join(timeout=12)

    assert not thread.is_alive(), "run_claimed did not return within 12 s"
    assert time.monotonic() - started < 12
    assert outcome == ["interrupted"]
    run = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    assert run["status"] == "interrupted"
    assert run["error_message"] == STOPPED_MESSAGE
    assert run["finished_at"] is not None
    assert spawned.all_exited()
    assert supervisor.active_run_id is None


def test_a_run_whose_row_disappears_stops_the_child_and_claims_nothing(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    spawned = _Spawned()
    spawned.install(monkeypatch)
    supervisor, engine, project_id, run_id = _claimed_run(client, settings, "sleep")
    thread, outcome = _in_thread(lambda: supervisor.run_claimed(run_id, threading.Event()))
    _wait_until(lambda: _epoch_of(client, project_id, run_id) == 1)

    with engine.begin() as connection:
        connection.execute(delete(TrainingRun).where(TrainingRun.id == run_id))
    thread.join(timeout=12)

    assert not thread.is_alive(), "the supervisor kept supervising a deleted run"
    assert outcome == ["vanished"]
    assert spawned.all_exited()  # the child is gone before anything else could be claimed
    assert queue.claim_next(engine) is None
    assert supervisor.active_run_id is None


def test_an_error_inside_the_watch_loop_never_leaves_the_child_training(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    spawned = _Spawned()
    spawned.install(monkeypatch)
    supervisor, _, _, run_id = _claimed_run(client, settings, "sleep")

    def broken(*args: object, **kwargs: object) -> int:
        raise RuntimeError("database exploded")

    monkeypatch.setattr(queue, "record_epoch", broken)

    with pytest.raises(RuntimeError, match="database exploded"):
        supervisor.run_claimed(run_id, threading.Event())

    assert spawned.all_exited()


def test_a_failed_run_keeps_the_trainer_message_and_a_short_clean_log_tail(
    client: TestClient, settings: Settings
) -> None:
    supervisor, _, project_id, run_id = _claimed_run(client, settings, "fail")

    assert supervisor.run_claimed(run_id, threading.Event()) == "failed"

    run = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    assert run["status"] == "failed"
    assert run["error_message"] == "Fake failure."
    tail_lines = run["log_tail"].splitlines()
    assert 0 < len(tail_lines) <= 50
    assert ESC not in run["log_tail"]
    assert tail_lines[-1] == "progress 50%"


def test_a_crashing_trainer_without_an_error_file_reports_its_exit_code(
    client: TestClient, settings: Settings
) -> None:
    supervisor, _, project_id, run_id = _claimed_run(client, settings, "crash")

    assert supervisor.run_claimed(run_id, threading.Event()) == "failed"

    run = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    assert run["status"] == "failed"
    assert run["error_message"] == "The training process exited with code 3."


def test_a_model_with_other_class_names_is_refused_and_no_model_row_exists(
    client: TestClient, settings: Settings
) -> None:
    supervisor, engine, project_id, run_id = _claimed_run(client, settings, "success")
    with Session(engine) as session, session.begin():
        session.get(TrainingRun, run_id).class_names = ["car"]

    assert supervisor.run_claimed(run_id, threading.Event()) == "failed"

    run = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    assert run["status"] == "failed"
    assert run["error_message"] == "The trained model's class names do not match the dataset."
    with Session(engine) as session:
        assert session.scalars(select(TrainedModel)).all() == []


def test_a_registration_failure_leaves_no_model_row_and_no_model_file(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    supervisor, engine, project_id, run_id = _claimed_run(client, settings, "success")

    def cannot_link(src: Path, dst: Path) -> bool:
        dst.write_bytes(b"half a copy")  # a failed copy may leave a partial file behind
        raise OSError("no space left on device")

    monkeypatch.setattr(queue, "link_or_copy", cannot_link)

    assert supervisor.run_claimed(run_id, threading.Event()) == "failed"

    run = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    assert run["status"] == "failed"
    assert run["error_message"].startswith("Could not register the trained model")
    assert run["model"] is None
    with Session(engine) as session:
        assert session.scalars(select(TrainedModel)).all() == []
    models_dir = layout.models_root(settings.data_dir)
    assert not models_dir.exists() or list(models_dir.iterdir()) == []
