"""Migration and cross-restart persistence tests against a real SQLite file (FOUND-01)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from yolo_trainer_api.migrate import migration_head
from yolo_trainer_api.settings import Settings

from .conftest import make_client


def test_startup_creates_data_dir_and_migrates(tmp_path: Path) -> None:
    data_dir = tmp_path / "fresh" / "data"
    assert not data_dir.exists()

    settings = Settings(data_dir=data_dir, allowed_hosts=["testserver", "localhost", "127.0.0.1"])
    with make_client(settings):
        pass

    assert data_dir.exists()
    db_path = settings.db_path
    assert db_path.exists()

    connection = sqlite3.connect(db_path)
    try:
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert "projects" in tables
        assert "images" in tables

        version_row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        assert version_row is not None
        assert version_row[0] == migration_head()
    finally:
        connection.close()


def test_data_persists_across_app_restart(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path / "data", allowed_hosts=["testserver", "localhost", "127.0.0.1"]
    )

    with make_client(settings) as first_app:
        response = first_app.post(
            "/api/projects", json={"name": "Persisted", "task_type": "segment"}
        )
        assert response.status_code == 201

    with make_client(settings) as second_app:
        listed = second_app.get("/api/projects")
        assert "Persisted" in [item["name"] for item in listed.json()]
