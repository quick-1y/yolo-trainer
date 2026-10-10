"""Migration and cross-restart persistence tests against a real SQLite file (FOUND-01)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
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


def _seed_0004(settings: Settings) -> None:
    stamp = "2026-10-04 10:00:00.000000"
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
        connection.commit()
    finally:
        connection.close()


def test_a_database_at_0004_upgrades_with_every_existing_image_unassigned(
    tmp_path: Path,
) -> None:
    settings = Settings(
        data_dir=tmp_path / "data", allowed_hosts=["testserver", "localhost", "127.0.0.1"]
    )
    settings.data_dir.mkdir(parents=True)
    config = _alembic_config(settings.sync_database_url)
    command.upgrade(config, "0004")
    _seed_0004(settings)

    command.upgrade(config, "head")

    connection = sqlite3.connect(settings.db_path)
    try:
        assert connection.execute("SELECT split FROM images WHERE id = 1").fetchone() == (None,)
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert {"training_runs", "models"} <= tables
        try:
            connection.execute("UPDATE images SET split = 'holdout' WHERE id = 1")
        except sqlite3.IntegrityError as error:
            assert "ck_images_split" in str(error)
        else:
            raise AssertionError("an unknown split value was accepted")
        sql = connection.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'training_runs'"
        ).fetchone()[0]
        assert "cancelled" in sql  # the seven-value status CHECK is in place from the start
    finally:
        connection.close()

    with make_client(settings) as client:
        (item,) = client.get("/api/projects/1/images").json()["items"]
        assert item["split"] is None


def test_0005_downgrades_to_0004_and_back_keeping_the_images(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path / "data", allowed_hosts=["testserver", "localhost", "127.0.0.1"]
    )
    settings.data_dir.mkdir(parents=True)
    config = _alembic_config(settings.sync_database_url)
    command.upgrade(config, "head")
    _seed_0004(settings)

    command.downgrade(config, "0004")

    connection = sqlite3.connect(settings.db_path)
    try:
        columns = [row[1] for row in connection.execute("PRAGMA table_info(images)")]
        assert "split" not in columns
        assert connection.execute("SELECT count(*) FROM images").fetchone() == (1,)
        assert (
            connection.execute(
                "SELECT name FROM sqlite_master WHERE name IN ('models', 'training_runs')"
            ).fetchall()
            == []
        )
    finally:
        connection.close()
    command.upgrade(config, "head")


def test_a_populated_0004_database_upgrades_keeping_annotations_and_autoincrement(
    tmp_path: Path,
) -> None:
    settings = Settings(
        data_dir=tmp_path / "data", allowed_hosts=["testserver", "localhost", "127.0.0.1"]
    )
    settings.data_dir.mkdir(parents=True)
    config = _alembic_config(settings.sync_database_url)
    command.upgrade(config, "0004")

    stamp = "2026-10-04 10:00:00.000000"
    connection = sqlite3.connect(settings.db_path)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            "INSERT INTO projects (id, name, normalized_name, task_type, created_at, updated_at) "
            "VALUES (1, 'Old', 'old', 'detect', ?, ?)",
            (stamp, stamp),
        )
        connection.execute(
            "INSERT INTO classes (id, project_id, name, normalized_name, color, position, "
            "created_at) VALUES (1, 1, 'car', 'car', '#E6194B', 0, ?)",
            (stamp,),
        )
        for image_id, name in ((1, "a.png"), (2, "b.png")):
            connection.execute(
                "INSERT INTO images (id, project_id, original_filename, filename_key, ext, "
                "sha256, size_bytes, width, height, created_at) "
                "VALUES (?, 1, ?, ?, 'png', ?, 10, 64, 48, ?)",
                (image_id, name, name, str(image_id) * 64, stamp),
            )
        for annotation_id, image_id, position in (
            ("box-1", 1, 0),
            ("box-2", 1, 1),
            ("box-3", 2, 0),
        ):
            connection.execute(
                "INSERT INTO annotations (id, image_id, class_id, kind, x, y, w, h, position, "
                "created_at, updated_at) VALUES (?, ?, 1, 'box', 0.1, 0.2, 0.3, 0.4, ?, ?, ?)",
                (annotation_id, image_id, position, stamp, stamp),
            )
        connection.commit()
    finally:
        connection.close()

    command.upgrade(config, "head")

    connection = sqlite3.connect(settings.db_path)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        assert connection.execute("SELECT id, split FROM images ORDER BY id").fetchall() == [
            (1, None),
            (2, None),
        ]
        assert connection.execute(
            "SELECT id, image_id, class_id, x, y, w, h, position FROM annotations ORDER BY id"
        ).fetchall() == [
            ("box-1", 1, 1, 0.1, 0.2, 0.3, 0.4, 0),
            ("box-2", 1, 1, 0.1, 0.2, 0.3, 0.4, 1),
            ("box-3", 2, 1, 0.1, 0.2, 0.3, 0.4, 0),
        ]
        images_sql = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'images'"
        ).fetchone()[0]
        assert "AUTOINCREMENT" in images_sql
        with pytest.raises(sqlite3.IntegrityError, match="ck_images_split"):
            connection.execute("UPDATE images SET split = 'bogus' WHERE id = 1")
        connection.rollback()
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            migration_head(),
        )
    finally:
        connection.close()
