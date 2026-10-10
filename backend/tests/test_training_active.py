"""Which run is training right now: GET /api/training/active (TRAN-04, D-11, D-14).

Real app and database; the run states are set straight through the worker's engine, the
same way the worker moves a run.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainingRun, utcnow
from yolo_trainer_api.settings import Settings
from yolo_trainer_worker import queue

from .training_helpers import setup_project, start_run, wait_status, worker_settings

ACTIVE_URL = "/api/training/active"


def _set_run(settings: Settings, run_id: int, **values: object) -> None:
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        with Session(engine) as session, session.begin():
            session.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(**values))
    finally:
        engine.dispose()


def _queued_run(client: TestClient, name: str = "Plates") -> tuple[int, dict]:
    ids = setup_project(client, name, train=1, valid=1)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    return ids["project_id"], run


def test_no_runs_at_all_answers_null(client: TestClient) -> None:
    response = client.get(ACTIVE_URL)

    assert response.status_code == 200
    assert response.json() is None


def test_a_queued_and_a_completed_run_are_not_active(
    client: TestClient, settings: Settings
) -> None:
    project_id, completed = _queued_run(client)
    _set_run(settings, completed["id"], status="completed")
    queued = start_run(client, project_id)
    wait_status(client, project_id, queued["id"], {"queued"})

    response = client.get(ACTIVE_URL)

    assert response.status_code == 200
    assert response.json() is None


def test_the_running_run_is_returned_with_its_project_and_epoch(
    client: TestClient, settings: Settings
) -> None:
    project_id, run = _queued_run(client, "Plates")
    started = utcnow()
    _set_run(settings, run["id"], status="running", epoch=12, epochs=100, started_at=started)

    response = client.get(ACTIVE_URL)

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "run_id": run["id"],
        "project_id": project_id,
        "project_name": "Plates",
        "run_name": run["name"],
        "epoch": 12,
        "epochs": 100,
        "started_at": body["started_at"],
    }
    assert body["started_at"].endswith("Z")


def test_a_running_run_before_its_first_epoch_has_a_null_epoch(
    client: TestClient, settings: Settings
) -> None:
    _, run = _queued_run(client)
    _set_run(settings, run["id"], status="running", started_at=utcnow())

    body = client.get(ACTIVE_URL).json()

    assert body["run_id"] == run["id"]
    assert body["epoch"] is None
    assert body["epochs"] == 2  # known from the start; only the epoch counter is missing
