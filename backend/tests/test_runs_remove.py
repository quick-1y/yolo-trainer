"""Taking a queued run out of the queue (TRAN-04, D-11).

Real app, real files, real worker queue; only the training command is replaced by
`fake_train_job.py`. The delete and the worker's claim are two guarded statements on
the same `status = 'queued'` row, so exactly one of them can win (T4-07-01).
"""

from __future__ import annotations

import threading

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_worker import queue
from yolo_trainer_worker.supervisor import Supervisor

from .training_helpers import (
    XHR,
    fake_command,
    setup_project,
    start_run,
    wait_status,
    worker_settings,
)


def _queued_runs(client: TestClient, count: int) -> tuple[int, list[dict]]:
    ids = setup_project(client, "Queue", train=1, valid=1)
    runs = [start_run(client, ids["project_id"]) for _ in range(count)]
    for run in runs:
        wait_status(client, ids["project_id"], run["id"], {"queued"})
    return ids["project_id"], runs


def _url(project_id: int, run_id: int) -> str:
    return f"/api/projects/{project_id}/runs/{run_id}"


def _worker_engine(settings: Settings) -> Engine:
    return queue.create_worker_engine(worker_settings(settings))


def _force_status(engine: Engine, run_id: int, status: str) -> None:
    with Session(engine) as session, session.begin():
        session.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(status=status))


def test_removing_a_queued_run_deletes_it_and_its_folder_and_later_runs_move_up(
    client: TestClient, settings: Settings
) -> None:
    project_id, (first, second, third) = _queued_runs(client, 3)
    assert layout.run_dir(settings.data_dir, second["id"]).is_dir()

    response = client.delete(_url(project_id, second["id"]), headers=XHR)

    assert response.status_code == 204
    assert response.content == b""
    assert not layout.run_dir(settings.data_dir, second["id"]).exists()
    assert client.get(_url(project_id, second["id"])).status_code == 404
    moved = client.get(_url(project_id, third["id"])).json()
    assert moved["queue_position"] == 2
    kept = client.get(_url(project_id, first["id"])).json()
    assert kept["queue_position"] == 1
    assert layout.run_dir(settings.data_dir, first["id"]).is_dir()


def test_a_run_that_is_no_longer_queued_is_refused_or_deleted_by_its_status(
    client: TestClient, settings: Settings
) -> None:
    """A running run answers 409 and stays; a finished one is no queue matter any more (D-15)."""
    project_id, (running, failed, done, waiting) = _queued_runs(client, 4)
    engine = _worker_engine(settings)
    assert queue.claim_next(engine) == running["id"]
    _force_status(engine, failed["id"], "failed")
    _force_status(engine, done["id"], "completed")

    response = client.delete(_url(project_id, running["id"]), headers=XHR)
    assert response.status_code == 409
    assert response.json()["detail"] == service.RUN_ACTIVE_DETAIL
    assert run_status(client, project_id, running["id"]) == "running"  # unchanged

    for run in (failed, done):
        assert client.delete(_url(project_id, run["id"]), headers=XHR).status_code == 204
        assert client.get(_url(project_id, run["id"])).status_code == 404
        assert not layout.run_dir(settings.data_dir, run["id"]).exists()

    assert layout.run_dir(settings.data_dir, running["id"]).is_dir()
    assert run_status(client, project_id, waiting["id"]) == "queued"


def run_status(client: TestClient, project_id: int, run_id: int) -> str:
    return client.get(_url(project_id, run_id)).json()["status"]


def test_the_409_message_is_the_one_the_modal_shows() -> None:
    assert (
        service.RUN_NOT_QUEUED_DETAIL
        == "This run has already started and can no longer be removed from the queue."
    )


def test_a_resumed_queued_run_is_not_removable_and_keeps_its_folder_and_checkpoint(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    engine = _worker_engine(settings)
    with Session(engine) as session, session.begin():
        session.execute(
            update(TrainingRun)
            .where(TrainingRun.id == run["id"])
            .values(resume_count=1, resume_epoch=3)
        )
    weights = layout.last_weights(layout.run_dir(settings.data_dir, run["id"]))
    weights.parent.mkdir(parents=True, exist_ok=True)
    weights.write_bytes(b"last")

    response = client.delete(_url(project_id, run["id"]), headers=XHR)

    assert response.status_code == 409
    assert response.json()["detail"] == service.RUN_RESUMED_DETAIL
    assert (
        service.RUN_RESUMED_DETAIL
        == "This run was resumed. Cancel the resume instead to keep its progress."
    )
    assert run_status(client, project_id, run["id"]) == "queued"
    assert weights.is_file()


def test_a_preparing_run_cannot_be_removed(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    _force_status(_worker_engine(settings), run["id"], "preparing")

    response = client.delete(_url(project_id, run["id"]), headers=XHR)

    assert response.status_code == 409
    assert response.json()["detail"] == service.RUN_ACTIVE_DETAIL
    assert run_status(client, project_id, run["id"]) == "preparing"


def test_unknown_and_foreign_runs_answer_404(client: TestClient) -> None:
    project_id, (run,) = _queued_runs(client, 1)
    other = setup_project(client, "Other", train=1, valid=1)

    unknown = client.delete(_url(project_id, 9999), headers=XHR)
    foreign = client.delete(_url(other["project_id"], run["id"]), headers=XHR)
    no_project = client.delete(_url(9999, run["id"]), headers=XHR)

    assert unknown.status_code == 404
    assert unknown.json()["detail"] == service.RUN_NOT_FOUND_DETAIL
    assert foreign.status_code == 404
    assert no_project.status_code == 404
    # the foreign delete changed nothing
    assert run_status(client, project_id, run["id"]) == "queued"


def test_removing_a_run_needs_the_xhr_header(client: TestClient) -> None:
    project_id, (run,) = _queued_runs(client, 1)

    response = client.delete(_url(project_id, run["id"]))

    assert response.status_code == 403
    assert run_status(client, project_id, run["id"]) == "queued"


def test_a_claimed_run_can_no_longer_be_removed(client: TestClient, settings: Settings) -> None:
    project_id, (claimed, other) = _queued_runs(client, 2)
    engine = _worker_engine(settings)

    assert queue.claim_next(engine) == claimed["id"]
    response = client.delete(_url(project_id, claimed["id"]), headers=XHR)

    assert response.status_code == 409
    assert run_status(client, project_id, claimed["id"]) == "running"
    assert run_status(client, project_id, other["id"]) == "queued"


def test_a_removed_run_is_never_claimed(client: TestClient, settings: Settings) -> None:
    project_id, (oldest, newer) = _queued_runs(client, 2)
    engine = _worker_engine(settings)

    assert client.delete(_url(project_id, oldest["id"]), headers=XHR).status_code == 204

    assert queue.claim_next(engine) == newer["id"]  # never the removed one
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command("success"),
        tick_seconds=0.05,
    )
    supervisor.run_claimed(newer["id"], threading.Event())
    assert queue.claim_next(engine) is None
    assert wait_status(client, project_id, newer["id"], {"completed"})["status"] == "completed"
