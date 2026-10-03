"""API-level tests for creating and listing project classes (PROJ-03, D-12..D-15)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from yolo_trainer_api.models import ProjectClass
from yolo_trainer_api.palette import CLASS_PALETTE, next_color
from yolo_trainer_api.settings import Settings

from .conftest import make_client


def _project(client: TestClient, name: str = "Vehicles") -> int:
    response = client.post("/api/projects", json={"name": name, "task_type": "detect"})
    assert response.status_code == 201
    return response.json()["id"]


def test_create_assigns_contiguous_index_and_palette_color(client: TestClient) -> None:
    project_id = _project(client)

    first = client.post(f"/api/projects/{project_id}/classes", json={"name": "car"})
    assert first.status_code == 201
    body = first.json()
    assert set(body) == {"id", "name", "color", "index", "created_at"}
    assert body["name"] == "car"
    assert body["index"] == 0
    assert body["color"] == "#E6194B"
    assert body["created_at"].endswith("Z")

    second = client.post(f"/api/projects/{project_id}/classes", json={"name": "plane"})
    assert second.status_code == 201
    assert second.json()["index"] == 1
    assert second.json()["color"] == "#3CB44B"

    listed = client.get(f"/api/projects/{project_id}/classes")
    assert listed.status_code == 200
    assert [c["name"] for c in listed.json()] == ["car", "plane"]
    assert [c["index"] for c in listed.json()] == [0, 1]


def test_duplicate_name_is_case_and_spacing_insensitive_per_project(client: TestClient) -> None:
    project_id = _project(client, "First")
    other_id = _project(client, "Second")
    assert client.post(f"/api/projects/{project_id}/classes", json={"name": "car"}).status_code == 201

    duplicate = client.post(f"/api/projects/{project_id}/classes", json={"name": " Car "})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == 'A class named "car" already exists.'
    assert len(client.get(f"/api/projects/{project_id}/classes").json()) == 1

    # D-12: the same name in another project is allowed and starts at index 0.
    elsewhere = client.post(f"/api/projects/{other_id}/classes", json={"name": "car"})
    assert elsewhere.status_code == 201
    assert elsewhere.json()["index"] == 0


def test_failed_create_does_not_consume_an_index(client: TestClient) -> None:
    project_id = _project(client)
    client.post(f"/api/projects/{project_id}/classes", json={"name": "car"})
    assert client.post(f"/api/projects/{project_id}/classes", json={"name": "CAR"}).status_code == 409

    third = client.post(f"/api/projects/{project_id}/classes", json={"name": "plane"})
    assert third.json()["index"] == 1


def test_explicit_color_is_uppercased_and_validated(client: TestClient) -> None:
    project_id = _project(client)

    ok = client.post(f"/api/projects/{project_id}/classes", json={"name": "x", "color": "#ff8800"})
    assert ok.status_code == 201
    assert ok.json()["color"] == "#FF8800"

    bad = client.post(f"/api/projects/{project_id}/classes", json={"name": "y", "color": "red"})
    assert bad.status_code == 422
    assert bad.json()["detail"].startswith("color:")
    assert len(client.get(f"/api/projects/{project_id}/classes").json()) == 1


@pytest.mark.parametrize("field", ["index", "position"])
def test_client_cannot_supply_an_index(client: TestClient, field: str) -> None:
    """D-13/D-14: indices derive from creation order; no request can set one."""
    project_id = _project(client)

    response = client.post(f"/api/projects/{project_id}/classes", json={"name": "car", field: 5})
    assert response.status_code == 422
    assert client.get(f"/api/projects/{project_id}/classes").json() == []


def test_no_reorder_surface_exists(client: TestClient) -> None:
    """D-14: classes expose list and create only; PATCH/PUT on the collection is not routed."""
    project_id = _project(client)
    for method in ("patch", "put", "delete"):
        response = getattr(client, method)(f"/api/projects/{project_id}/classes", json={})
        assert response.status_code == 405


@pytest.mark.parametrize(
    "name",
    ["", "   ", "x" * 101, "bad\x00name", "tab\tname"],
)
def test_invalid_names_rejected(client: TestClient, name: str) -> None:
    project_id = _project(client)
    response = client.post(f"/api/projects/{project_id}/classes", json={"name": name})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert client.get(f"/api/projects/{project_id}/classes").json() == []


def test_hundred_code_point_name_accepted(client: TestClient) -> None:
    project_id = _project(client)
    name = "я" * 100
    response = client.post(f"/api/projects/{project_id}/classes", json={"name": name})
    assert response.status_code == 201
    assert response.json()["name"] == name


def test_unknown_project_returns_404(client: TestClient) -> None:
    listed = client.get("/api/projects/999999/classes")
    assert listed.status_code == 404
    assert listed.json()["detail"] == "Project not found."

    created = client.post("/api/projects/999999/classes", json={"name": "car"})
    assert created.status_code == 404
    assert created.json()["detail"] == "Project not found."


def test_palette_cycles_when_exhausted(client: TestClient) -> None:
    project_id = _project(client)
    colors = []
    for i in range(len(CLASS_PALETTE) + 1):
        response = client.post(f"/api/projects/{project_id}/classes", json={"name": f"c{i}"})
        assert response.status_code == 201
        colors.append(response.json()["color"])
    assert colors[: len(CLASS_PALETTE)] == list(CLASS_PALETTE)
    assert colors[-1] in CLASS_PALETTE
    assert colors[-1] != ""


def test_next_color_prefers_first_unused_and_is_case_insensitive() -> None:
    assert next_color([], 0) == CLASS_PALETTE[0]
    assert next_color([CLASS_PALETTE[0].lower()], 1) == CLASS_PALETTE[1]
    assert next_color([CLASS_PALETTE[0], CLASS_PALETTE[2]], 2) == CLASS_PALETTE[1]
    assert next_color(list(CLASS_PALETTE), 17) == CLASS_PALETTE[0]
    assert next_color(list(CLASS_PALETTE), 19) == CLASS_PALETTE[2]


def test_palette_excludes_low_contrast_colors() -> None:
    assert len(CLASS_PALETTE) == 17
    assert len(set(CLASS_PALETTE)) == 17
    for dropped in ("#800000", "#000075", "#A9A9A9"):
        assert dropped not in CLASS_PALETTE


def test_twenty_concurrent_creates_yield_contiguous_indices(client: TestClient) -> None:
    project_id = _project(client)

    def create(i: int) -> int:
        response = client.post(f"/api/projects/{project_id}/classes", json={"name": f"class-{i}"})
        assert response.status_code == 201, response.text
        return response.json()["index"]

    with ThreadPoolExecutor(max_workers=10) as pool:
        indices = list(pool.map(create, range(20)))

    assert sorted(indices) == list(range(20))
    assert len(set(indices)) == 20
    listed = client.get(f"/api/projects/{project_id}/classes").json()
    assert [c["index"] for c in listed] == list(range(20))


def test_direct_insert_of_case_variant_name_violates_unique_index(
    client: TestClient, settings: Settings
) -> None:
    project_id = _project(client)

    sync_engine = create_engine(settings.sync_database_url)
    try:
        with Session(sync_engine) as session_a, Session(sync_engine) as session_b:
            first = ProjectClass(project_id=project_id, color="#E6194B", position=0)
            first.set_name("Car")
            session_a.add(first)
            session_a.commit()

            second = ProjectClass(project_id=project_id, color="#3CB44B", position=1)
            second.set_name("cAR")
            session_b.add(second)
            with pytest.raises(IntegrityError) as raised:
                session_b.commit()
            assert "normalized_name" in str(raised.value)
    finally:
        sync_engine.dispose()


def test_deleting_project_cascades_to_classes(client: TestClient, settings: Settings) -> None:
    project_id = _project(client)
    client.post(f"/api/projects/{project_id}/classes", json={"name": "car"})
    client.post(f"/api/projects/{project_id}/classes", json={"name": "plane"})

    assert client.delete(f"/api/projects/{project_id}").status_code == 204

    sync_engine = create_engine(settings.sync_database_url)
    try:
        with sync_engine.connect() as connection:
            remaining = connection.execute(text("SELECT COUNT(*) FROM classes")).scalar_one()
        assert remaining == 0
    finally:
        sync_engine.dispose()


def test_classes_survive_app_restart(settings: Settings) -> None:
    with make_client(settings) as first_run:
        project_id = _project(first_run)
        first_run.post(f"/api/projects/{project_id}/classes", json={"name": "car"})
        first_run.post(f"/api/projects/{project_id}/classes", json={"name": "plane"})
        before = first_run.get(f"/api/projects/{project_id}/classes").json()

    with make_client(settings) as second_run:
        after = second_run.get(f"/api/projects/{project_id}/classes").json()

    assert len(after) == 2
    assert after == before
    assert [(c["index"], c["color"]) for c in after] == [(0, "#E6194B"), (1, "#3CB44B")]
