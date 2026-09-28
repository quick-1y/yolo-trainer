"""Persistence, WAL-checkpointing, DATA_DIR-validation and Host allow-list tests.

RESEARCH "Common Pitfalls" #1 (SQLite WAL on a Docker Desktop bind mount can
fail silently) and Security V12 (DATA_DIR validation) motivate this module.
All tests run against a real per-test SQLite file and a real Alembic
migration (no database mocking, per D-20/D-27).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from yolo_trainer_api.db import apply_sqlite_pragmas
from yolo_trainer_api.settings import Settings

from .conftest import make_client


def test_default_journal_mode_is_wal(settings: Settings) -> None:
    with make_client(settings):
        pass

    connection = sqlite3.connect(settings.db_path)
    try:
        mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode == "wal"
    finally:
        connection.close()

    fresh = sqlite3.connect(":memory:")
    try:
        apply_sqlite_pragmas(fresh, "WAL")
        assert fresh.execute("PRAGMA synchronous").fetchone()[0] == 1
        assert fresh.execute("PRAGMA busy_timeout").fetchone()[0] == 30000
    finally:
        fresh.close()


def test_delete_journal_mode_escape_hatch(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path / "data",
        sqlite_journal_mode="DELETE",
        allowed_hosts=["testserver", "localhost", "127.0.0.1"],
    )

    with make_client(settings) as client:
        response = client.post("/api/projects", json={"name": "Delete Mode", "task_type": "detect"})
        assert response.status_code == 201

    connection = sqlite3.connect(settings.db_path)
    try:
        mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode == "delete"
    finally:
        connection.close()

    assert not (settings.data_dir / "app.db-wal").exists()


def test_wal_checkpointed_on_shutdown(settings: Settings) -> None:
    with make_client(settings) as client:
        response = client.post(
            "/api/projects", json={"name": "Checkpoint Me", "task_type": "detect"}
        )
        assert response.status_code == 201

    wal_file = settings.data_dir / "app.db-wal"
    assert not wal_file.exists() or wal_file.stat().st_size == 0

    connection = sqlite3.connect(settings.db_path)
    try:
        row = connection.execute(
            "SELECT name FROM projects WHERE name = ?", ("Checkpoint Me",)
        ).fetchone()
        assert row is not None
    finally:
        connection.close()


def test_data_dir_that_is_a_file_fails_fast(tmp_path: Path) -> None:
    blocked_path = tmp_path / "not-a-directory"
    blocked_path.write_text("occupied")
    settings = Settings(
        data_dir=blocked_path, allowed_hosts=["testserver", "localhost", "127.0.0.1"]
    )

    with pytest.raises(Exception) as exc_info:  # noqa: PT011 - exact type crosses ASGI lifespan boundary
        with make_client(settings):
            pass

    assert str(blocked_path) in str(exc_info.value)


def test_restart_is_migration_noop(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path / "data", allowed_hosts=["testserver", "localhost", "127.0.0.1"]
    )

    with make_client(settings) as first_client:
        response = first_client.post(
            "/api/projects", json={"name": "Noop Restart", "task_type": "detect"}
        )
        assert response.status_code == 201

    with make_client(settings) as second_client:
        listed = second_client.get("/api/projects")
        assert listed.status_code == 200
        names = [project["name"] for project in listed.json()]
        assert names.count("Noop Restart") == 1

    connection = sqlite3.connect(settings.db_path)
    try:
        rows = connection.execute("SELECT version_num FROM alembic_version").fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "0001"
    finally:
        connection.close()


def test_disallowed_host_rejected(client) -> None:  # noqa: ANN001 - TestClient fixture
    rejected = client.get("/api/health", headers={"Host": "evil.example"})
    assert rejected.status_code == 400

    allowed = client.get("/api/health", headers={"Host": "127.0.0.1:8080"})
    assert allowed.status_code == 200


def test_allowed_hosts_parses_comma_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_HOSTS", "localhost, 192.168.1.5")
    settings = Settings()
    assert settings.allowed_hosts == ["localhost", "192.168.1.5"]
