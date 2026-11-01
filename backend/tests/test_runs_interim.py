"""The interim best.pt of an unfinished run: a download, never a registered model (D-08).

Real app and files; the statuses are set straight in the database. The file is offered for
cancelled, interrupted and failed runs with a non-empty best.pt only, and nothing ever
registers it or lists it in the base-model picker.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel, TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_worker import queue

from .training_helpers import setup_project, start_run, wait_status, worker_settings

WEIGHTS = b"interim-weights-\x00\x01\x02"


def _url(project_id: int, run_id: int) -> str:
    return f"/api/projects/{project_id}/runs/{run_id}"


def _run(client: TestClient, name: str = "Plates") -> tuple[int, dict]:
    ids = setup_project(client, name, train=1, valid=1)
    run = start_run(client, ids["project_id"], name="run-2")
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    return ids["project_id"], run


def _force_status(settings: Settings, run_id: int, status: str) -> None:
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        with Session(engine) as session, session.begin():
            session.execute(
                update(TrainingRun).where(TrainingRun.id == run_id).values(status=status)
            )
    finally:
        engine.dispose()


def _write_best(settings: Settings, run_id: int, data: bytes = WEIGHTS) -> None:
    path = layout.best_weights(layout.run_dir(settings.data_dir, run_id))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _model_rows(settings: Settings) -> int:
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        with Session(engine) as session:
            return session.execute(select(func.count()).select_from(TrainedModel)).scalar_one()
    finally:
        engine.dispose()


@pytest.mark.parametrize("status", ["cancelled", "interrupted", "failed"])
def test_an_unfinished_run_with_a_best_pt_offers_it_as_a_download(
    client: TestClient, settings: Settings, status: str
) -> None:
    project_id, run = _run(client)
    _force_status(settings, run["id"], status)
    _write_best(settings, run["id"])

    detail = client.get(_url(project_id, run["id"])).json()
    response = client.get(f"{_url(project_id, run['id'])}/interim-best")

    assert detail["interim_best"] is True
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert 'filename="Plates_run-2_interim_best.pt"' in response.headers["content-disposition"]
    assert response.headers["content-disposition"].startswith("attachment")
    assert response.content == WEIGHTS


@pytest.mark.parametrize("status", ["preparing", "queued", "running", "completed"])
def test_an_active_or_completed_run_has_no_interim_download(
    client: TestClient, settings: Settings, status: str
) -> None:
    project_id, run = _run(client)
    _force_status(settings, run["id"], status)
    _write_best(settings, run["id"])

    detail = client.get(_url(project_id, run["id"])).json()
    response = client.get(f"{_url(project_id, run['id'])}/interim-best")

    assert detail["interim_best"] is False
    assert response.status_code == 404
    assert response.json()["detail"] == service.INTERIM_NOT_FOUND_DETAIL
    assert service.INTERIM_NOT_FOUND_DETAIL == "No interim model is available for this run."


def test_a_missing_or_empty_best_pt_is_not_offered(client: TestClient, settings: Settings) -> None:
    project_id, run = _run(client)
    _force_status(settings, run["id"], "cancelled")

    missing = client.get(f"{_url(project_id, run['id'])}/interim-best")
    assert missing.status_code == 404
    assert client.get(_url(project_id, run["id"])).json()["interim_best"] is False

    _write_best(settings, run["id"], b"")
    empty = client.get(f"{_url(project_id, run['id'])}/interim-best")
    assert empty.status_code == 404
    assert empty.json()["detail"] == service.INTERIM_NOT_FOUND_DETAIL
    assert client.get(_url(project_id, run["id"])).json()["interim_best"] is False


def test_another_projects_or_an_unknown_run_answers_404(
    client: TestClient, settings: Settings
) -> None:
    project_id, run = _run(client)
    _force_status(settings, run["id"], "cancelled")
    _write_best(settings, run["id"])
    other = setup_project(client, "Other", train=1, valid=1)

    foreign = client.get(f"{_url(other['project_id'], run['id'])}/interim-best")
    unknown = client.get(f"{_url(project_id, 9999)}/interim-best")
    no_project = client.get(f"{_url(9999, run['id'])}/interim-best")

    assert foreign.status_code == 404
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == service.RUN_NOT_FOUND_DETAIL
    assert no_project.status_code == 404


def test_the_interim_file_never_becomes_a_model_or_a_base_option(
    client: TestClient, settings: Settings
) -> None:
    project_id, run = _run(client)
    _force_status(settings, run["id"], "cancelled")
    _write_best(settings, run["id"])

    assert client.get(f"{_url(project_id, run['id'])}/interim-best").status_code == 200
    options = client.get(f"/api/projects/{project_id}/training/options").json()

    assert options["models"] == []
    assert _model_rows(settings) == 0
    assert client.get(_url(project_id, run["id"])).json()["model"] is None


def test_the_run_list_does_not_touch_the_filesystem_per_row(
    client: TestClient, settings: Settings
) -> None:
    project_id, run = _run(client)
    _force_status(settings, run["id"], "cancelled")
    _write_best(settings, run["id"])

    listed = client.get(f"/api/projects/{project_id}/runs").json()

    assert "interim_best" not in listed[0]
