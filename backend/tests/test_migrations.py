"""Migration and cross-restart persistence tests against a real SQLite file (FOUND-01)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command

from yolo_trainer_api.migrate import _alembic_config, migration_head
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


def test_a_database_at_0003_upgrades_to_head_and_keeps_its_images_unannotated(
    tmp_path: Path,
) -> None:
    settings = Settings(
        data_dir=tmp_path / "data", allowed_hosts=["testserver", "localhost", "127.0.0.1"]
    )
    settings.data_dir.mkdir(parents=True)
    config = _alembic_config(settings.sync_database_url)
    command.upgrade(config, "0003")

    stamp = "2026-10-03 10:00:00.000000"
    connection = sqlite3.connect(settings.db_path)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            "INSERT INTO projects (id, name, normalized_name, task_type, created_at, updated_at) "
            "VALUES (1, 'Old', 'old', 'detect', ?, ?)",
            (stamp, stamp),
        )
        connection.execute(
            "INSERT INTO images (id, project_id, original_filename, filename_key, ext, sha256, "
            "size_bytes, width, height, created_at) "
            "VALUES (1, 1, 'a.png', 'a.png', 'png', ?, 10, 64, 48, ?)",
            ("a" * 64, stamp),
        )
        connection.execute(
            "INSERT INTO classes (id, project_id, name, normalized_name, color, position, "
            "created_at) VALUES (1, 1, 'car', 'car', '#E6194B', 0, ?)",
            (stamp,),
        )
        connection.commit()
    finally:
        connection.close()

    command.upgrade(config, "head")

    connection = sqlite3.connect(settings.db_path)
    try:
        image = connection.execute(
            "SELECT is_background, is_reviewed, annotation_version FROM images WHERE id = 1"
        ).fetchone()
        assert image == (0, 0, 0)
        names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE tbl_name = 'annotations'"
            )
        }
        assert {"annotations", "ix_annotations_image_id", "ix_annotations_class_id"} <= names
        head = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        assert head == (migration_head(),)
    finally:
        connection.close()

    with make_client(settings) as client:
        items = client.get("/api/projects/1/images").json()["items"]
        assert len(items) == 1
        assert items[0]["box_count"] == 0
        assert items[0]["status"] == "unannotated"
        assert items[0]["is_background"] is False
        assert items[0]["is_reviewed"] is False
        classes = client.get("/api/projects/1/classes").json()
        assert [c["name"] for c in classes] == ["car"]
