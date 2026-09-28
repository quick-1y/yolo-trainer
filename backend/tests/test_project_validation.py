"""Edge-case tests for project create/list input rules (PROJ-01, PROJ-02).

Covers: empty/whitespace input, Unicode code-point length, NFKC/casefold
uniqueness (including DB-level enforcement bypassing the API), idempotent
create, list ordering determinism, control-character rejection, description
normalization, and UTC timestamp formatting.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from yolo_trainer_api.models import Project
from yolo_trainer_api.settings import Settings


@pytest.mark.parametrize("name", ["", "   "])
def test_empty_or_whitespace_name_rejected(client: TestClient, name: str) -> None:
    response = client.post("/api/projects", json={"name": name, "task_type": "detect"})
    assert response.status_code == 422
    assert response.json()["detail"].startswith("name:")


def test_missing_task_type_rejected(client: TestClient) -> None:
    response = client.post("/api/projects", json={"name": "No Type"})
    assert response.status_code == 422
    assert "task_type" in response.json()["detail"]


def test_task_type_wrong_case_rejected(client: TestClient) -> None:
    response = client.post("/api/projects", json={"name": "Wrong Case", "task_type": "Detect"})
    assert response.status_code == 422


def test_name_at_max_length_accepted_over_max_rejected(client: TestClient) -> None:
    ok = client.post("/api/projects", json={"name": "я" * 100, "task_type": "detect"})
    assert ok.status_code == 201

    too_long = client.post("/api/projects", json={"name": "я" * 101, "task_type": "detect"})
    assert too_long.status_code == 422


def test_duplicate_name_case_and_whitespace_insensitive(client: TestClient) -> None:
    first = client.post("/api/projects", json={"name": "Car", "task_type": "detect"})
    assert first.status_code == 201

    duplicate = client.post("/api/projects", json={"name": " CAR ", "task_type": "detect"})
    assert duplicate.status_code == 409


def test_duplicate_name_unicode_case_insensitive(client: TestClient) -> None:
    first = client.post("/api/projects", json={"name": "Проект", "task_type": "detect"})
    assert first.status_code == 201

    duplicate = client.post("/api/projects", json={"name": "ПРОЕКТ", "task_type": "detect"})
    assert duplicate.status_code == 409


def test_duplicate_name_nfc_and_nfkc_equivalent_forms(client: TestClient) -> None:
    first = client.post("/api/projects", json={"name": "éclair", "task_type": "detect"})
    assert first.status_code == 201
    assert first.json()["name"] == "éclair"

    duplicate = client.post("/api/projects", json={"name": "ÉCLAIR", "task_type": "detect"})
    assert duplicate.status_code == 409


@pytest.mark.parametrize("name", ["bad\u0007name", "tab\tname"])
def test_control_character_in_name_rejected(client: TestClient, name: str) -> None:
    response = client.post("/api/projects", json={"name": name, "task_type": "detect"})
    assert response.status_code == 422


@pytest.mark.parametrize(("description", "name"), [("", "Desc Empty"), ("   ", "Desc Blank")])
def test_blank_description_stored_as_null(client: TestClient, description: str, name: str) -> None:
    response = client.post(
        "/api/projects",
        json={"name": name, "task_type": "detect", "description": description},
    )
    assert response.status_code == 201
    assert response.json()["description"] is None


def test_description_over_2000_code_points_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/projects",
        json={"name": "Long Desc", "task_type": "detect", "description": "x" * 2001},
    )
    assert response.status_code == 422


def test_duplicate_create_returns_201_then_409_with_single_listed_row(
    client: TestClient,
) -> None:
    first = client.post("/api/projects", json={"name": "Repeatable", "task_type": "detect"})
    assert first.status_code == 201

    second = client.post("/api/projects", json={"name": "Repeatable", "task_type": "detect"})
    assert second.status_code == 409

    listed = client.get("/api/projects").json()
    assert [item["name"] for item in listed].count("Repeatable") == 1


def test_direct_insert_raises_integrity_error_on_duplicate_normalized_name(
    client: TestClient, settings: Settings
) -> None:
    """Bypass the API entirely - the unique index is the real source of truth."""
    sync_engine = create_engine(settings.sync_database_url)
    try:
        with Session(sync_engine) as session:
            first = Project(task_type="detect")
            first.set_name("Dup")
            session.add(first)
            session.commit()

        with Session(sync_engine) as session:
            second = Project(task_type="detect")
            second.set_name("dup")
            session.add(second)
            with pytest.raises(IntegrityError):
                session.commit()
    finally:
        sync_engine.dispose()


def test_empty_database_returns_empty_list(client: TestClient) -> None:
    assert client.get("/api/projects").json() == []


def test_list_order_falls_back_to_id_desc_when_updated_at_equal(
    client: TestClient, settings: Settings
) -> None:
    sync_engine = create_engine(settings.sync_database_url)
    try:
        fixed_time = datetime(2026, 1, 1, tzinfo=UTC)
        with Session(sync_engine) as session:
            first = Project(task_type="detect")
            first.set_name("First")
            first.created_at = fixed_time
            first.updated_at = fixed_time
            session.add(first)
            session.commit()

        with Session(sync_engine) as session:
            second = Project(task_type="detect")
            second.set_name("Second")
            second.created_at = fixed_time
            second.updated_at = fixed_time
            session.add(second)
            session.commit()
    finally:
        sync_engine.dispose()

    listed = client.get("/api/projects").json()
    names = [item["name"] for item in listed]
    assert names.index("Second") < names.index("First")


def test_timestamps_are_utc_z_suffixed(client: TestClient) -> None:
    response = client.post("/api/projects", json={"name": "UTC Check", "task_type": "detect"})
    body = response.json()
    assert body["created_at"].endswith("Z")
    assert body["updated_at"].endswith("Z")


def test_conflict_detail_uses_stored_display_name(client: TestClient) -> None:
    client.post("/api/projects", json={"name": "  Car  ", "task_type": "detect"})
    duplicate = client.post("/api/projects", json={"name": "car", "task_type": "detect"})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == 'A project named "Car" already exists.'
