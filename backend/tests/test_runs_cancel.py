"""Cancelling a running run: the api sets a flag, the worker supervisor does the stopping.

Real app, real worker queue, real supervisor and real child processes; only the training
command is the fake trainer (`fake_train_job.py`, mode `sleep`). The api never signals a
process: control crosses to the worker through the database only (TRAN-06, D-06..D-08).
"""

from __future__ import annotations

import threading

from fastapi.testclient import TestClient
from sqlalchemy import Engine, select, update
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


def _force_status(engine: Engine, run_id: int, status: str) -> None:
    with Session(engine) as session, session.begin():
        session.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(status=status))


def _requested_at(engine: Engine, run_id: int):
    with Session(engine) as session:
        return session.scalar(
            select(TrainingRun.cancel_requested_at).where(TrainingRun.id == run_id)
        )


def test_cancelling_needs_the_xhr_header(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]

    response = client.post(f"{_url(project_id, run['id'])}/cancel")

    assert response.status_code == 403
    assert _requested_at(engine, run["id"]) is None


def test_only_a_running_run_can_be_cancelled_and_any_other_run_is_left_unchanged(
    client: TestClient, settings: Settings
) -> None:
    project_id, runs = _queued_runs(client, 5)
    queued, preparing, completed, failed, interrupted = runs
    engine = queue.create_worker_engine(worker_settings(settings))
    _force_status(engine, preparing["id"], "preparing")
    _force_status(engine, completed["id"], "completed")
    _force_status(engine, failed["id"], "failed")
    _force_status(engine, interrupted["id"], "interrupted")

    for run, status in (
        (queued, "queued"),
        (preparing, "preparing"),
        (completed, "completed"),
        (failed, "failed"),
        (interrupted, "interrupted"),
    ):
        response = _cancel(client, project_id, run["id"])
        assert response.status_code == 409, status
        assert response.json()["detail"] == service.RUN_NOT_CANCELLABLE_DETAIL
        assert client.get(_url(project_id, run["id"])).json()["status"] == status
        assert _requested_at(engine, run["id"]) is None


def test_a_cancelled_run_cannot_be_cancelled_again(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]
    _cancel(client, project_id, run["id"])
    assert queue.mark_cancelled(engine, run["id"], None) == 1

    response = _cancel(client, project_id, run["id"])

    assert response.status_code == 409
    assert client.get(_url(project_id, run["id"])).json()["cancelling"] is False


def test_a_run_of_another_project_or_an_unknown_run_answers_404_and_changes_nothing(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    other = setup_project(client, "Other", train=1, valid=1)
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]

    foreign = _cancel(client, other["project_id"], run["id"])
    unknown = _cancel(client, project_id, 9999)
    no_project = _cancel(client, 9999, run["id"])

    assert foreign.status_code == 404
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == service.RUN_NOT_FOUND_DETAIL
    assert no_project.status_code == 404
    assert _requested_at(engine, run["id"]) is None  # the foreign request flagged nothing


def test_a_second_cancel_while_still_running_answers_200_and_keeps_the_first_timestamp(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]

    first = _cancel(client, project_id, run["id"])
    stamp = _requested_at(engine, run["id"])
    second = _cancel(client, project_id, run["id"])

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["cancelling"] is True
    assert stamp is not None
    assert _requested_at(engine, run["id"]) == stamp


def _force(engine: Engine, run_id: int, **values: object) -> None:
    with Session(engine) as session, session.begin():
        session.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(**values))


def _row(engine: Engine, run_id: int) -> TrainingRun:
    with Session(engine) as session:
        run = session.get(TrainingRun, run_id)
        session.expunge(run)
        return run


def test_cancelling_a_queued_resume_keeps_the_progress_of_the_run(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], resume_count=1, resume_epoch=4, epoch=4, active_seconds=12.5)
    weights = layout.last_weights(layout.run_dir(settings.data_dir, run["id"]))
    weights.parent.mkdir(parents=True, exist_ok=True)
    weights.write_bytes(b"last")

    response = _cancel(client, project_id, run["id"])

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["cancelling"] is False
    assert (body["resume_count"], body["resume_epoch"], body["active_seconds"]) == (1, 4, 12.5)
    assert body["finished_at"] is not None
    assert body["can_resume"] is True  # the resume can be started again
    row = _row(engine, run["id"])
    assert row.cancel_requested_at is None
    assert (row.resume_count, row.resume_epoch, row.epoch) == (1, 4, 4)
    assert weights.is_file()
    assert layout.run_dir(settings.data_dir, run["id"]).is_dir()
    assert queue.claim_next(engine) is None  # it left the queue


def test_a_never_resumed_queued_run_still_cannot_be_cancelled(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))

    response = _cancel(client, project_id, run["id"])

    assert response.status_code == 409
    assert response.json()["detail"] == service.RUN_NOT_CANCELLABLE_DETAIL
    assert _row(engine, run["id"]).status == "queued"


def test_a_resume_claimed_by_the_worker_first_is_cancelled_the_normal_way(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], resume_count=1, resume_epoch=2)
    assert queue.claim_next(engine) == run["id"]

    response = _cancel(client, project_id, run["id"])

    assert response.status_code == 200
    assert response.json()["status"] == "running"
    assert response.json()["cancelling"] is True  # the flag path of a running run


def test_the_not_cancellable_message_is_the_one_the_modal_shows() -> None:
    assert service.RUN_NOT_CANCELLABLE_DETAIL == "Only a running run can be cancelled."
