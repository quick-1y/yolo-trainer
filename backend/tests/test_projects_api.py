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
