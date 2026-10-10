"""Deleting a project that owns training runs and models, and the startup sweep of
`data/runs` and `data/models` (D-21).

Rows are seeded straight into the database with the worker's engine (the real schema, real
foreign keys); everything else goes through the real api.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from yolo_trainer_api import storage
from yolo_trainer_api.models import TrainedModel, TrainingRun
from yolo_trainer_api.routers import projects as projects_router
from yolo_trainer_api.settings import Settings
from yolo_trainer_common import layout
from yolo_trainer_worker import queue

from .conftest import make_client
from .test_storage_cleanup import make_dir_link, touch
from .training_helpers import setup_project, worker_settings

ACTIVE_DETAIL = (
    "A training run is active or queued for this project. "
    "Wait for it to finish or remove it from the queue."
)


def seed_run(
    settings: Settings,
    project_id: int,
    name: str,
    status: str,
    *,
    with_model: bool = False,
    base_model_id: int | None = None,
    base_name: str = "yolo26n",
) -> tuple[int, int | None]:
    """Insert one run (and optionally its model) with their files; returns the ids."""
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        with Session(engine) as session:
            run = TrainingRun(
                project_id=project_id,
                name=name,
                normalized_name=name.lower(),
                status=status,
                task_type="detect",
                base_kind="model" if base_model_id is not None else "official",
                base_name=base_name,
                base_model_id=base_model_id,
                settings={},
            )
            session.add(run)
            session.flush()
            touch(layout.run_dir(settings.data_dir, run.id) / "job.json")
            model_id = None
            if with_model:
                model = TrainedModel(
                    project_id=project_id,
                    source_run_id=run.id,
                    name=name,
                    task_type="detect",
                    source="trained",
                    class_names=["box"],
                    size_bytes=1,
                    sha256="0" * 64,
                )
                session.add(model)
                session.flush()
                model_id = model.id
                touch(layout.model_file(settings.data_dir, model_id))
            session.commit()
            return run.id, model_id
    finally:
        engine.dispose()


def count_rows(settings: Settings, table: str, where: str = "1 = 1") -> int:
    connection = sqlite3.connect(settings.db_path)
    try:
        return connection.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}").fetchone()[0]  # noqa: S608
    finally:
        connection.close()


def run_row(settings: Settings, run_id: int) -> tuple | None:
    connection = sqlite3.connect(settings.db_path)
    try:
        return connection.execute(
            "SELECT base_name, base_model_id FROM training_runs WHERE id = ?", (run_id,)
        ).fetchone()
    finally:
        connection.close()


def test_the_project_payload_counts_runs_models_and_active_runs(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Counted", train=1, valid=1)
    project_id = ids["project_id"]
    seed_run(settings, project_id, "first", "completed", with_model=True)
    seed_run(settings, project_id, "second", "failed")

    fetched = client.get(f"/api/projects/{project_id}").json()
    [listed] = [p for p in client.get("/api/projects").json() if p["id"] == project_id]

    assert (fetched["run_count"], fetched["model_count"], fetched["active_run_count"]) == (2, 1, 0)
    assert fetched == listed


@pytest.mark.parametrize("status", ["preparing", "queued", "running"])
def test_an_active_run_shows_in_the_active_count(
    client: TestClient, settings: Settings, status: str
) -> None:
    project_id = setup_project(client, f"Active {status}", train=1)["project_id"]
    seed_run(settings, project_id, "going", status)

    fetched = client.get(f"/api/projects/{project_id}").json()

    assert (fetched["run_count"], fetched["model_count"], fetched["active_run_count"]) == (1, 0, 1)


def test_deleting_a_project_removes_its_runs_models_and_files(
    client: TestClient, settings: Settings
) -> None:
    project_id = setup_project(client, "Doomed", train=1, valid=1)["project_id"]
    done_id, model_id = seed_run(settings, project_id, "done", "completed", with_model=True)
    failed_id, _ = seed_run(settings, project_id, "broken", "failed")
    done_dir = layout.run_dir(settings.data_dir, done_id)
    failed_dir = layout.run_dir(settings.data_dir, failed_id)
    model_path = layout.model_file(settings.data_dir, model_id)
    assert done_dir.is_dir() and failed_dir.is_dir() and model_path.is_file()

    response = client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 204
    assert count_rows(settings, "training_runs", f"project_id = {project_id}") == 0
    assert count_rows(settings, "models", f"project_id = {project_id}") == 0
    assert not done_dir.exists()
    assert not failed_dir.exists()
    assert not model_path.exists()
    assert not (settings.projects_dir / str(project_id)).exists()


def test_another_projects_run_keeps_its_base_name_when_the_base_model_goes(
    client: TestClient, settings: Settings
) -> None:
    doomed = setup_project(client, "Source", train=1)["project_id"]
    survivor = setup_project(client, "Consumer", train=1)["project_id"]
    _, model_id = seed_run(settings, doomed, "base", "completed", with_model=True)
    consumer_run, _ = seed_run(
        settings, survivor, "child", "completed", base_model_id=model_id, base_name="base"
    )

    assert client.delete(f"/api/projects/{doomed}").status_code == 204

    assert run_row(settings, consumer_run) == ("base", None)
    assert layout.run_dir(settings.data_dir, consumer_run).is_dir()
    fetched = client.get(f"/api/projects/{survivor}").json()
    assert fetched["run_count"] == 1


@pytest.mark.parametrize("status", ["preparing", "queued", "running"])
def test_a_project_with_an_active_run_cannot_be_deleted(
    client: TestClient, settings: Settings, status: str
) -> None:
    ids = setup_project(client, f"Busy {status}", train=1, valid=1)
    project_id = ids["project_id"]
    run_id, _ = seed_run(settings, project_id, "going", status)
    done_id, model_id = seed_run(settings, project_id, "done", "completed", with_model=True)

    response = client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 409
    assert response.json()["detail"] == ACTIVE_DETAIL
    assert response.json()["detail"] == projects_router.PROJECT_HAS_ACTIVE_RUN_DETAIL
    assert client.get(f"/api/projects/{project_id}").status_code == 200
    assert count_rows(settings, "images", f"project_id = {project_id}") == 2
    assert count_rows(settings, "training_runs", f"project_id = {project_id}") == 2
    assert count_rows(settings, "models", f"project_id = {project_id}") == 1
    assert layout.run_dir(settings.data_dir, run_id).is_dir()
    assert layout.run_dir(settings.data_dir, done_id).is_dir()
    assert layout.model_file(settings.data_dir, model_id).is_file()
    assert (settings.projects_dir / str(project_id)).is_dir()


def test_a_run_queued_after_the_delete_looked_at_the_project_still_blocks_it(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_id = setup_project(client, "Raced", train=1)["project_id"]
    original = projects_router.get_project_or_404
    seeded: list[int] = []

    async def queue_a_run_right_after_the_lookup(session, looked_up_id):  # noqa: ANN001, ANN202
        project = await original(session, looked_up_id)
        await session.commit()  # end the read transaction, like a request that took a while
        seeded.append(seed_run(settings, looked_up_id, "late", "queued")[0])
        return project

    monkeypatch.setattr(projects_router, "get_project_or_404", queue_a_run_right_after_the_lookup)

    response = client.delete(f"/api/projects/{project_id}")

    assert seeded
    assert response.status_code == 409
    assert response.json()["detail"] == ACTIVE_DETAIL
    assert count_rows(settings, "projects", f"id = {project_id}") == 1
    assert layout.run_dir(settings.data_dir, seeded[0]).is_dir()


def test_deleting_a_missing_project_is_still_a_404(client: TestClient) -> None:
    assert client.delete("/api/projects/424242").status_code == 404


def test_a_failing_run_folder_removal_does_not_fail_the_delete(
    client: TestClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    project_id = setup_project(client, "Stuck runs", train=1)["project_id"]
    run_id, model_id = seed_run(settings, project_id, "done", "completed", with_model=True)

    def boom(*args: object, **kwargs: object) -> None:
        raise OSError("locked by another process")

    monkeypatch.setattr(projects_router, "remove_run_dir", boom)
    with caplog.at_level(logging.ERROR):
        response = client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 204
    assert count_rows(settings, "training_runs", f"project_id = {project_id}") == 0
    assert any(str(run_id) in record.getMessage() for record in caplog.records)
    assert not layout.model_file(settings.data_dir, model_id).exists()


# ---- the pure decisions ------------------------------------------------------------------


def test_find_orphan_runs_returns_only_canonical_unreferenced_names() -> None:
    names = ["1", "2", "999", "007", "5a", "-3", ".x", "backup", "٣", " 7", "1.5"]

    assert storage.find_orphan_runs(names, {1, 2}) == ["999"]


def test_find_orphan_models_returns_only_canonical_unreferenced_files() -> None:
    names = ["1.pt", "2.pt", "999.pt", "007.pt", "5.pth", ".x.tmp-1", "3.pt.bak", "notes.txt"]

    assert storage.find_orphan_models(names, {1, 2}) == ["999.pt"]


# ---- the sweep on a real data dir --------------------------------------------------------


def test_startup_removes_stray_run_folders_and_model_files_and_keeps_the_rest(
    settings: Settings,
) -> None:
    with make_client(settings) as first:
        project_id = setup_project(first, "Sweep", train=1)["project_id"]
    run_id, model_id = seed_run(settings, project_id, "done", "completed", with_model=True)
    stray_run = touch(layout.runs_root(settings.data_dir) / "999" / "dataset" / "a.txt").parent
    stray_model = touch(layout.models_root(settings.data_dir) / "999.pt")
    weights = touch(layout.weights_file(settings.data_dir, "yolo26n"))
    partial = touch(layout.models_root(settings.data_dir) / ".x.tmp-1")
    padded_run = touch(layout.runs_root(settings.data_dir) / "007" / "keep.txt")
    padded_model = touch(layout.models_root(settings.data_dir) / "007.pt")

    with make_client(settings) as second:
        assert second.get("/api/health").status_code == 200

    assert not stray_run.parent.exists()
    assert not stray_model.exists()
    assert layout.run_dir(settings.data_dir, run_id).is_dir()
    assert layout.model_file(settings.data_dir, model_id).is_file()
    assert weights.is_file()
    assert partial.is_file()
    assert padded_run.is_file()
    assert padded_model.is_file()


def test_links_under_data_runs_are_neither_followed_nor_removed(
    settings: Settings, tmp_path: Path
) -> None:
    with make_client(settings) as first:
        project_id = setup_project(first, "Links", train=1)["project_id"]
    seed_run(settings, project_id, "done", "completed")
    victim = touch(tmp_path / "elsewhere" / "keep.txt")
    link = layout.runs_root(settings.data_dir) / "424242"
    make_dir_link(link, victim.parent)

    with make_client(settings) as second:
        assert second.get("/api/health").status_code == 200

    assert os.path.lexists(link)
    assert victim.is_file()


def test_an_empty_runs_table_is_a_safety_valve_for_data_runs(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    with make_client(settings) as first:
        setup_project(first, "Valve", train=1)
    survivor = touch(layout.runs_root(settings.data_dir) / "5" / "job.json")

    with caplog.at_level(logging.INFO), make_client(settings) as second:
        assert second.get("/api/health").status_code == 200

    assert survivor.is_file()
    assert any(
        record.levelno >= logging.ERROR and record.name == storage.logger.name
        for record in caplog.records
    )


def test_an_empty_models_table_is_a_safety_valve_for_data_models(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    with make_client(settings) as first:
        project_id = setup_project(first, "Valve models", train=1)["project_id"]
    run_id, _ = seed_run(settings, project_id, "done", "completed")
    survivor = touch(layout.models_root(settings.data_dir) / "5.pt")
    stray_run = touch(layout.runs_root(settings.data_dir) / "999" / "job.json").parent

    with caplog.at_level(logging.INFO), make_client(settings) as second:
        assert second.get("/api/health").status_code == 200

    assert survivor.is_file()
    assert not stray_run.exists()  # runs are reconciled on their own: the runs table is not empty
    assert layout.run_dir(settings.data_dir, run_id).is_dir()
    assert any(
        record.levelno >= logging.ERROR and record.name == storage.logger.name
        for record in caplog.records
    )


def test_reconcile_orphans_counts_runs_and_models_and_skips_a_missing_root(
    settings: Settings,
) -> None:
    assert storage.reconcile_orphans(settings, set(), set(), {1}, {1}) == 0

    touch(layout.runs_root(settings.data_dir) / "1" / "job.json")
    touch(layout.runs_root(settings.data_dir) / "2" / "job.json")
    touch(layout.models_root(settings.data_dir) / "1.pt")
    touch(layout.models_root(settings.data_dir) / "2.pt")
    touch(layout.models_root(settings.data_dir) / "3.pt")

    removed = storage.reconcile_orphans(settings, set(), set(), {1}, {1})

    assert removed == 3
    assert (layout.runs_root(settings.data_dir) / "1").is_dir()
    assert not (layout.runs_root(settings.data_dir) / "2").exists()
    assert layout.model_file(settings.data_dir, 1).is_file()
    assert not layout.model_file(settings.data_dir, 2).exists()
    assert not layout.model_file(settings.data_dir, 3).exists()
