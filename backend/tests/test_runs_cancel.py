"""Cancelling a running run: the api sets a flag, the worker supervisor does the stopping.

Real app, real worker queue, real supervisor and real child processes; only the training
command is the fake trainer (`fake_train_job.py`, mode `sleep`). The api never signals a
process: control crosses to the worker through the database only (TRAN-06, D-06..D-08).
"""

from __future__ import annotations

import threading

from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel, TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_worker import queue
from yolo_trainer_worker.supervisor import CANCELLED, Supervisor

from .test_worker_supervisor import _in_thread, _Spawned, _wait_until
from .training_helpers import (
    XHR,
    fake_command,
    setup_project,
    start_run,
    wait_status,
    worker_settings,
)


def _url(project_id: int, run_id: int) -> str:
    return f"/api/projects/{project_id}/runs/{run_id}"


def _cancel(client: TestClient, project_id: int, run_id: int):
    return client.post(f"{_url(project_id, run_id)}/cancel", headers=XHR)


def _queued_runs(client: TestClient, count: int, name: str = "Cancel") -> tuple[int, list[dict]]:
    ids = setup_project(client, name, train=2, valid=1)
    runs = [start_run(client, ids["project_id"]) for _ in range(count)]
    for run in runs:
        wait_status(client, ids["project_id"], run["id"], {"queued"})
    return ids["project_id"], runs


def _supervisor(settings: Settings, mode: str) -> tuple[Supervisor, Engine]:
    engine = queue.create_worker_engine(worker_settings(settings))
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command(mode),
        tick_seconds=0.05,
    )
    return supervisor, engine


def _epoch(client: TestClient, project_id: int, run_id: int) -> int | None:
    return client.get(_url(project_id, run_id)).json()["epoch"]


def test_cancelling_a_running_run_ends_it_without_a_model_and_the_queue_moves_on(
    client: TestClient, settings: Settings, monkeypatch
) -> None:
    spawned = _Spawned()
    spawned.install(monkeypatch)
    project_id, (first, second) = _queued_runs(client, 2)
    supervisor, engine = _supervisor(settings, "sleep")
    assert queue.claim_next(engine) == first["id"]
    thread, outcome = _in_thread(lambda: supervisor.run_claimed(first["id"], threading.Event()))
    _wait_until(lambda: _epoch(client, project_id, first["id"]) == 1)

    response = _cancel(client, project_id, first["id"])

    assert response.status_code == 200
    assert response.json()["cancelling"] is True
    assert response.json()["status"] == "running"
    thread.join(timeout=15)
    assert not thread.is_alive(), "the supervisor did not stop the cancelled run in time"
    assert outcome == [CANCELLED]
    run = wait_status(client, project_id, first["id"], {"cancelled"})
    assert run["cancelling"] is False  # a finished run is not "cancelling" any more
    assert run["finished_at"] is not None
    assert run["error_category"] is None
    assert run["error_message"] is None
    assert spawned.all_exited()  # no orphan child
    assert supervisor.active_run_id is None
    # the interim best.pt stays on disk, but a cancelled run never registers a model (D-08)
    assert layout.best_weights(layout.run_dir(settings.data_dir, first["id"])).is_file()
    with Session(engine) as session:
        assert session.scalars(select(TrainedModel)).all() == []
    # the next queued run can be claimed right away
    assert queue.claim_next(engine) == second["id"]


def test_the_api_only_sets_the_flag_and_never_touches_the_worker_pid(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]

    response = _cancel(client, project_id, run["id"])

    assert response.status_code == 200
    with Session(engine) as session:
        row = session.get(TrainingRun, run["id"])
        assert row.status == "running"  # only the supervisor ends a run
        assert row.cancel_requested_at is not None
        assert row.worker_pid is None
    assert queue.run_control(engine, run["id"])[0] == "running"
    assert queue.run_control(engine, run["id"])[1] is not None


def test_the_cancel_flag_is_read_back_as_cancelling_in_the_summary_and_the_list(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]
    assert client.get(_url(project_id, run["id"])).json()["cancelling"] is False

    _cancel(client, project_id, run["id"])

    assert client.get(_url(project_id, run["id"])).json()["cancelling"] is True
    (listed,) = client.get(f"/api/projects/{project_id}/runs").json()
    assert listed["cancelling"] is True


def test_the_not_cancellable_message_is_the_one_the_modal_shows() -> None:
    assert service.RUN_NOT_CANCELLABLE_DETAIL == "Only a running run can be cancelled."
