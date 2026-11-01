"""Deleting a finished run with its folder and registered model (TRAN-08, D-15).

Real app, real files; the statuses are set straight in the database so no training is
needed. The delete is a hard delete with no trash: the run row, its folder and its model
(row and file) go, models fine-tuned from that model elsewhere keep the base name as text.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel, TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_worker import queue

from .training_helpers import (
    XHR,
    seed_model,
    setup_project,
    start_run,
    wait_status,
    worker_settings,
)


def _url(project_id: int, run_id: int) -> str:
    return f"/api/projects/{project_id}/runs/{run_id}"


def _engine(settings: Settings) -> Engine:
    return queue.create_worker_engine(worker_settings(settings))


def _runs(client: TestClient, count: int, name: str = "Delete") -> tuple[int, list[dict]]:
    ids = setup_project(client, name, train=1, valid=1)
    runs = [start_run(client, ids["project_id"]) for _ in range(count)]
    for run in runs:
        wait_status(client, ids["project_id"], run["id"], {"queued"})
    return ids["project_id"], runs


def _force_status(settings: Settings, run_id: int, status: str) -> None:
    engine = _engine(settings)
    try:
        with Session(engine) as session, session.begin():
            session.execute(
                update(TrainingRun).where(TrainingRun.id == run_id).values(status=status)
            )
    finally:
        engine.dispose()


def _give_model(settings: Settings, project_id: int, run_id: int, name: str = "run-model") -> int:
    """Register a model produced by `run_id` (row and file)."""
    model_id = seed_model(settings, project_id, name)
    engine = _engine(settings)
    try:
        with Session(engine) as session, session.begin():
            session.execute(
                update(TrainedModel).where(TrainedModel.id == model_id).values(source_run_id=run_id)
            )
    finally:
        engine.dispose()
    return model_id


def _make_base(settings: Settings, run_id: int, model_id: int, status: str) -> None:
    """Make `run_id` a run that fine-tunes from `model_id`, in `status`."""
    engine = _engine(settings)
    try:
        with Session(engine) as session, session.begin():
            session.execute(
                update(TrainingRun)
                .where(TrainingRun.id == run_id)
                .values(
                    status=status, base_kind="model", base_name="run-model", base_model_id=model_id
                )
            )
    finally:
        engine.dispose()


def _rows(settings: Settings, run_id: int) -> tuple[bool, int]:
    """(run row exists, number of model rows produced by that run)."""
    engine = _engine(settings)
    try:
        with Session(engine) as session:
            run = session.get(TrainingRun, run_id)
            models = session.execute(
                select(TrainedModel.id).where(TrainedModel.source_run_id == run_id)
            ).all()
            return run is not None, len(models)
    finally:
        engine.dispose()


def test_deleting_a_completed_run_removes_row_folder_and_model(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run, _other) = _runs(client, 2)
    _force_status(settings, run["id"], "completed")
    model_id = _give_model(settings, project_id, run["id"])
    assert layout.run_dir(settings.data_dir, run["id"]).is_dir()
    assert layout.model_file(settings.data_dir, model_id).is_file()

    response = client.delete(_url(project_id, run["id"]), headers=XHR)

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(_url(project_id, run["id"])).status_code == 404
    assert not layout.run_dir(settings.data_dir, run["id"]).exists()
    assert not layout.model_file(settings.data_dir, model_id).exists()
    assert _rows(settings, run["id"]) == (False, 0)
    # the other run of the project is untouched
    assert client.get(_url(project_id, _other["id"])).status_code == 200
    assert layout.run_dir(settings.data_dir, _other["id"]).is_dir()


def test_a_model_fine_tuned_from_the_deleted_one_keeps_the_base_name(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run, child) = _runs(client, 2)
    _force_status(settings, run["id"], "completed")
    model_id = _give_model(settings, project_id, run["id"])
    _make_base(settings, child["id"], model_id, "completed")

    response = client.delete(_url(project_id, run["id"]), headers=XHR)

    assert response.status_code == 204
    kept = client.get(_url(project_id, child["id"])).json()
    assert kept["base_kind"] == "model"
    assert kept["base_name"] == "run-model"
    engine = _engine(settings)
    try:
        with Session(engine) as session:
            assert session.get(TrainingRun, child["id"]).base_model_id is None
    finally:
        engine.dispose()


def test_failed_interrupted_and_cancelled_runs_can_be_deleted(
    client: TestClient, settings: Settings
) -> None:
    project_id, runs = _runs(client, 3)
    for run, status in zip(runs, ("failed", "interrupted", "cancelled"), strict=True):
        _force_status(settings, run["id"], status)

    for run in runs:
        response = client.delete(_url(project_id, run["id"]), headers=XHR)
        assert response.status_code == 204
        assert client.get(_url(project_id, run["id"])).status_code == 404
        assert not layout.run_dir(settings.data_dir, run["id"]).exists()


def test_preparing_and_running_runs_answer_409_and_stay(
    client: TestClient, settings: Settings
) -> None:
    project_id, (preparing, running) = _runs(client, 2)
    _force_status(settings, preparing["id"], "preparing")
    _force_status(settings, running["id"], "running")

    for run, status in ((preparing, "preparing"), (running, "running")):
        response = client.delete(_url(project_id, run["id"]), headers=XHR)
        assert response.status_code == 409, status
        assert response.json()["detail"] == service.RUN_ACTIVE_DETAIL
        assert client.get(_url(project_id, run["id"])).json()["status"] == status
        assert layout.run_dir(settings.data_dir, run["id"]).is_dir()
    assert service.RUN_ACTIVE_DETAIL == "This run is still active. Cancel it before deleting it."


def test_a_never_resumed_queued_run_is_removed_from_the_queue(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _runs(client, 1)

    response = client.delete(_url(project_id, run["id"]), headers=XHR)

    assert response.status_code == 204
    assert not layout.run_dir(settings.data_dir, run["id"]).exists()


def test_a_resumed_queued_run_answers_409_and_stays(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _runs(client, 1)
    engine = _engine(settings)
    try:
        with Session(engine) as session, session.begin():
            session.execute(
                update(TrainingRun)
                .where(TrainingRun.id == run["id"])
                .values(resume_count=1, resume_epoch=1)
            )
    finally:
        engine.dispose()

    response = client.delete(_url(project_id, run["id"]), headers=XHR)

    assert response.status_code == 409
    assert response.json()["detail"] == service.RUN_RESUMED_DETAIL
    assert client.get(_url(project_id, run["id"])).json()["status"] == "queued"


def test_a_model_that_is_the_base_of_an_active_run_blocks_the_delete(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run, *dependents) = _runs(client, 4)
    _force_status(settings, run["id"], "completed")
    model_id = _give_model(settings, project_id, run["id"])
    for dependent, status in zip(dependents, ("preparing", "queued", "running"), strict=True):
        _make_base(settings, dependent["id"], model_id, status)
        # a Cancel-resume-style queued row would be removed by the other branch; keep rows plain
        response = client.delete(_url(project_id, run["id"]), headers=XHR)

        assert response.status_code == 409, status
        assert response.json()["detail"] == service.RUN_MODEL_IN_USE_DETAIL
        _make_base(settings, dependent["id"], model_id, "completed")  # next round: no dependent

    assert (
        service.RUN_MODEL_IN_USE_DETAIL
        == "The model of this run is the base of a run that is still active. "
        "Wait until that run finishes."
    )
    # nothing was removed by the refused attempts
    assert _rows(settings, run["id"]) == (True, 1)
    assert layout.run_dir(settings.data_dir, run["id"]).is_dir()
    assert layout.model_file(settings.data_dir, model_id).is_file()


def test_a_finished_dependent_does_not_block_the_delete(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run, child) = _runs(client, 2)
    _force_status(settings, run["id"], "completed")
    model_id = _give_model(settings, project_id, run["id"])
    _make_base(settings, child["id"], model_id, "failed")

    assert client.delete(_url(project_id, run["id"]), headers=XHR).status_code == 204


def test_delete_needs_the_xhr_header_and_the_right_project(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _runs(client, 1)
    _force_status(settings, run["id"], "completed")
    other = setup_project(client, "Other", train=1, valid=1)

    no_header = client.delete(_url(project_id, run["id"]))
    foreign = client.delete(_url(other["project_id"], run["id"]), headers=XHR)
    unknown = client.delete(_url(project_id, 9999), headers=XHR)

    assert no_header.status_code == 403
    assert foreign.status_code == 404
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == service.RUN_NOT_FOUND_DETAIL
    assert client.get(_url(project_id, run["id"])).status_code == 200
    assert layout.run_dir(settings.data_dir, run["id"]).is_dir()


def test_the_run_read_names_the_model(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _runs(client, 1)
    _force_status(settings, run["id"], "completed")
    _give_model(settings, project_id, run["id"], name="run-1")

    body = client.get(_url(project_id, run["id"])).json()

    assert body["model"]["name"] == "run-1"


def test_project_delete_removes_run_folders_and_models_through_the_shared_helper(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _runs(client, 1)
    _force_status(settings, run["id"], "completed")
    model_id = _give_model(settings, project_id, run["id"])

    assert client.delete(f"/api/projects/{project_id}", headers=XHR).status_code == 204

    assert not layout.run_dir(settings.data_dir, run["id"]).exists()
    assert not layout.model_file(settings.data_dir, model_id).exists()
