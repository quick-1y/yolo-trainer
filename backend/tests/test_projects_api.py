"""API-level tests for project create/list behavior (PROJ-01, PROJ-02)."""

from __future__ import annotations

from fastapi.testclient import TestClient


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
