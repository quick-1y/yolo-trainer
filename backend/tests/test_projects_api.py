"""API-level tests for project create/list/update/delete behavior (PROJ-01, PROJ-02)."""

from __future__ import annotations

import logging
import shutil
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from yolo_trainer_api.models import Project
from yolo_trainer_api.settings import Settings

from .imaging import make_image_bytes

XHR = {"X-Requested-With": "yolo-trainer"}


def _upload_png(client: TestClient, project_id: int, shade: int = 0) -> None:
    data = make_image_bytes("PNG", size=(32 + shade, 24))
    response = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", (f"i{shade}.png", data, "image/png"))],
        headers=XHR,
    )
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "added"


def _count_rows(settings: Settings, table: str, project_id: int) -> int:
    connection = sqlite3.connect(settings.db_path)
    try:
        return connection.execute(
            f"SELECT COUNT(*) FROM {table} WHERE project_id = ?",  # noqa: S608
            (project_id,),
        ).fetchone()[0]
    finally:
        connection.close()


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_and_list_round_trip(client: TestClient) -> None:
    response = client.post("/api/projects", json={"name": "Cars", "task_type": "detect"})
    assert response.status_code == 201

    body = response.json()
    assert isinstance(body["id"], int)
    assert body["name"] == "Cars"
    assert body["task_type"] == "detect"
    assert body["description"] is None
    assert body["created_at"].endswith("Z")
    assert body["updated_at"].endswith("Z")

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert "Cars" in [item["name"] for item in listed.json()]


def test_duplicate_name_is_case_insensitive(client: TestClient) -> None:
    first = client.post("/api/projects", json={"name": "Cars", "task_type": "detect"})
    assert first.status_code == 201

    duplicate = client.post("/api/projects", json={"name": " cars ", "task_type": "detect"})
    assert duplicate.status_code == 409

    detail = duplicate.json()["detail"]
    assert isinstance(detail, str)
    assert "already exists" in detail

    listed = client.get("/api/projects")
    assert len(listed.json()) == 1


def test_list_sorted_by_updated_at_desc(client: TestClient) -> None:
    created_a = client.post("/api/projects", json={"name": "A", "task_type": "detect"})
    created_b = client.post("/api/projects", json={"name": "B", "task_type": "detect"})
    assert created_a.status_code == 201
    assert created_b.status_code == 201

    listed = client.get("/api/projects").json()
    assert [item["name"] for item in listed] == ["B", "A"]


def test_invalid_task_type_rejected(client: TestClient) -> None:
    response = client.post("/api/projects", json={"name": "X", "task_type": "obb"})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_get_project_by_id_returns_same_body_as_list(client: TestClient) -> None:
    created = client.post("/api/projects", json={"name": "Cars", "task_type": "detect"})
    assert created.status_code == 201
    project_id = created.json()["id"]

    listed = client.get("/api/projects")
    [listed_project] = [p for p in listed.json() if p["id"] == project_id]

    fetched = client.get(f"/api/projects/{project_id}")
    assert fetched.status_code == 200
    assert fetched.json() == listed_project


def test_get_project_unknown_id_returns_404(client: TestClient) -> None:
    response = client.get("/api/projects/999999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found."


def test_get_project_non_integer_id_returns_422(client: TestClient) -> None:
    response = client.get("/api/projects/abc")
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_patch_rename_to_own_case_variant_succeeds(client: TestClient) -> None:
    created = client.post("/api/projects", json={"name": "cars", "task_type": "detect"})
    project_id = created.json()["id"]

    response = client.patch(f"/api/projects/{project_id}", json={"name": "Cars"})
    assert response.status_code == 200
    assert response.json()["name"] == "Cars"


def test_patch_rename_to_case_variant_of_other_project_conflicts(client: TestClient) -> None:
    client.post("/api/projects", json={"name": "Cars", "task_type": "detect"})
    boats = client.post("/api/projects", json={"name": "Boats", "task_type": "detect"})
    boats_id = boats.json()["id"]

    response = client.patch(f"/api/projects/{boats_id}", json={"name": "CARS"})
    assert response.status_code == 409
    assert response.json()["detail"] == 'A project named "Cars" already exists.'

    unchanged = client.get(f"/api/projects/{boats_id}")
    assert unchanged.json()["name"] == "Boats"


def test_patch_empty_body_leaves_project_unchanged(client: TestClient) -> None:
    created = client.post("/api/projects", json={"name": "Untouched", "task_type": "detect"})
    body = created.json()
    project_id = body["id"]

    response = client.patch(f"/api/projects/{project_id}", json={})
    assert response.status_code == 200
    assert response.json() == body


def test_patch_task_type_rejected(client: TestClient) -> None:
    created = client.post("/api/projects", json={"name": "Locked Type", "task_type": "detect"})
    project_id = created.json()["id"]

    response = client.patch(f"/api/projects/{project_id}", json={"task_type": "segment"})
    assert response.status_code == 422
    assert (
        response.json()["detail"] == "The task type cannot be changed after a project is created."
    )

    unchanged = client.get(f"/api/projects/{project_id}")
    assert unchanged.json()["task_type"] == "detect"


def test_patch_empty_name_rejected(client: TestClient) -> None:
    created = client.post("/api/projects", json={"name": "Has Name", "task_type": "detect"})
    project_id = created.json()["id"]

    response = client.patch(f"/api/projects/{project_id}", json={"name": ""})
    assert response.status_code == 422


def test_patch_null_name_rejected(client: TestClient) -> None:
    created = client.post("/api/projects", json={"name": "Has Name Too", "task_type": "detect"})
    project_id = created.json()["id"]

    response = client.patch(f"/api/projects/{project_id}", json={"name": None})
    assert response.status_code == 422


def test_patch_null_description_clears_it(client: TestClient) -> None:
    created = client.post(
        "/api/projects",
        json={"name": "Has Desc", "task_type": "detect", "description": "notes"},
    )
    project_id = created.json()["id"]

    response = client.patch(f"/api/projects/{project_id}", json={"description": None})
    assert response.status_code == 200
    assert response.json()["description"] is None


def test_patch_blank_description_clears_it(client: TestClient) -> None:
    created = client.post(
        "/api/projects",
        json={"name": "Has Desc Too", "task_type": "detect", "description": "notes"},
    )
    project_id = created.json()["id"]

    response = client.patch(f"/api/projects/{project_id}", json={"description": "  "})
    assert response.status_code == 200
    assert response.json()["description"] is None


def test_patch_rename_bumps_updated_at_and_moves_project_first(client: TestClient) -> None:
    first = client.post("/api/projects", json={"name": "First", "task_type": "detect"})
    client.post("/api/projects", json={"name": "Second", "task_type": "detect"})
    first_id = first.json()["id"]
    first_updated_at = first.json()["updated_at"]

    response = client.patch(f"/api/projects/{first_id}", json={"name": "First Renamed"})
    assert response.status_code == 200
    assert response.json()["updated_at"] != first_updated_at

    listed = client.get("/api/projects").json()
    assert listed[0]["name"] == "First Renamed"


def test_patch_unknown_id_returns_404(client: TestClient) -> None:
    response = client.patch("/api/projects/999999", json={"name": "Ghost"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found."


def test_delete_unknown_id_returns_404(client: TestClient) -> None:
    response = client.delete("/api/projects/999999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found."


def test_delete_returns_204_removes_project_and_repeat_delete_404s(
    client: TestClient,
) -> None:
    created = client.post("/api/projects", json={"name": "Doomed", "task_type": "detect"})
    project_id = created.json()["id"]

    response = client.delete(f"/api/projects/{project_id}")
    assert response.status_code == 204
    assert response.content == b""

    assert client.get(f"/api/projects/{project_id}").status_code == 404
    assert project_id not in [p["id"] for p in client.get("/api/projects").json()]

    again = client.delete(f"/api/projects/{project_id}")
    assert again.status_code == 404


def test_concurrent_renames_to_same_name_one_wins_one_409s(
    client: TestClient, settings: Settings
) -> None:
    """Backstop for the DB-level unique index: two concurrent renames of
    different projects to the same target name, via two separate synchronous
    sessions - mirrors Plan 03's direct-insert collision test."""
    client.post("/api/projects", json={"name": "Alpha", "task_type": "detect"})
    client.post("/api/projects", json={"name": "Beta", "task_type": "detect"})

    sync_engine = create_engine(settings.sync_database_url)
    try:
        with Session(sync_engine) as session_a, Session(sync_engine) as session_b:
            alpha = session_a.execute(
                select(Project).where(Project.normalized_name == "alpha")
            ).scalar_one()
            beta = session_b.execute(
                select(Project).where(Project.normalized_name == "beta")
            ).scalar_one()

            alpha.set_name("Same Name")
            session_a.commit()

            beta.set_name("same name")
            with pytest.raises(IntegrityError):
                session_b.commit()
    finally:
        sync_engine.dispose()


def test_delete_removes_project_folder_and_all_rows(client: TestClient, settings: Settings) -> None:
    project_id = client.post("/api/projects", json={"name": "Full", "task_type": "detect"}).json()[
        "id"
    ]
    _upload_png(client, project_id)
    assert (
        client.post(f"/api/projects/{project_id}/classes", json={"name": "car"}).status_code == 201
    )
    folder = settings.projects_dir / str(project_id)
    assert folder.is_dir()

    assert client.delete(f"/api/projects/{project_id}").status_code == 204

    assert not folder.exists()
    assert _count_rows(settings, "images", project_id) == 0
    assert _count_rows(settings, "classes", project_id) == 0


def test_delete_succeeds_and_logs_when_folder_removal_fails(
    client: TestClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    project_id = client.post("/api/projects", json={"name": "Stuck", "task_type": "detect"}).json()[
        "id"
    ]
    _upload_png(client, project_id)

    def fail(*args: object, **kwargs: object) -> None:
        raise OSError("locked by another process")

    monkeypatch.setattr(shutil, "rmtree", fail)
    with caplog.at_level(logging.ERROR):
        response = client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 204
    assert project_id not in [p["id"] for p in client.get("/api/projects").json()]
    assert any(str(project_id) in record.getMessage() for record in caplog.records)
    assert (settings.projects_dir / str(project_id)).exists()


def test_delete_project_without_a_folder_is_fine(client: TestClient, settings: Settings) -> None:
    project_id = client.post("/api/projects", json={"name": "Empty", "task_type": "detect"}).json()[
        "id"
    ]
    assert not (settings.projects_dir / str(project_id)).exists()

    assert client.delete(f"/api/projects/{project_id}").status_code == 204
