"""Startup cleanup of orphaned files under data/projects/ (DATA-01, D-19).

`find_orphans` is pure and is exercised with hostile listings; the restart tests
drive the real app over a real DATA_DIR on disk - nothing is mocked except where
a failure has to be forced.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yolo_trainer_api import main as main_module
from yolo_trainer_api import storage
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.storage import ProjectDirListing, find_orphans

from .conftest import make_client
from .imaging import make_image_bytes

XHR = {"X-Requested-With": "yolo-trainer"}


def listing(
    images: list[str] | None = None,
    thumbs: list[str] | None = None,
    incoming: list[str] | None = None,
    is_symlink: bool = False,
) -> ProjectDirListing:
    return ProjectDirListing(
        is_symlink=is_symlink,
        images=images or [],
        thumbs=thumbs or [],
        incoming=incoming or [],
    )


def create_project_with_image(client: TestClient, name: str = "Cleanup") -> tuple[int, int]:
    project_id = client.post("/api/projects", json={"name": name, "task_type": "detect"}).json()[
        "id"
    ]
    response = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", ("a.png", make_image_bytes("PNG"), "image/png"))],
        headers=XHR,
    )
    result = response.json()["results"][0]
    assert result["status"] == "added"
    return project_id, result["image"]["id"]


def make_dir_link(link: Path, target: Path) -> None:
    """Link `link` to the directory `target`: a symlink, or a junction on Windows."""
    try:
        os.symlink(target, link, target_is_directory=True)
        return
    except (OSError, NotImplementedError):
        pass
    if os.name == "nt":
        import _winapi

        try:
            _winapi.CreateJunction(str(target), str(link))
            return
        except OSError:
            pass
    pytest.skip("creating directory links is not permitted here")


def touch(path: Path, content: bytes = b"x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def test_find_orphans_returns_only_unreferenced_app_named_files() -> None:
    orphans = find_orphans(
        {
            "1": listing(
                images=["10.jpg", "11.png", "notes.txt", "12.jpg.bak", "10.png"],
                thumbs=["10.webp", "11.webp"],
                incoming=["abc.tmp"],
            )
        },
        project_ids={1},
        image_keys={(1, 10, "jpg")},
    )

    assert sorted(orphans) == sorted(
        [
            Path("1/images/11.png"),
            Path("1/images/10.png"),
            Path("1/thumbs/11.webp"),
            Path("1/.incoming/abc.tmp"),
        ]
    )


def test_find_orphans_treats_a_project_dir_without_a_row_as_orphan_as_a_whole() -> None:
    orphans = find_orphans(
        {"5": listing(images=["1.jpg"], thumbs=["1.webp"]), "1": listing()},
        project_ids={1},
        image_keys=set(),
    )

    assert orphans == [Path("5")]


@pytest.mark.parametrize("name", ["backup", "5a", "007", "-3", "1.5", "٣", " 5", ".incoming", "5 "])
def test_find_orphans_ignores_directories_not_named_by_an_integer_id(name: str) -> None:
    assert find_orphans({name: listing(images=["1.jpg"])}, project_ids={1}, image_keys=set()) == []


def test_find_orphans_ignores_symbolic_links() -> None:
    orphans = find_orphans(
        {"5": listing(is_symlink=True), "1": listing(is_symlink=True, incoming=["a.tmp"])},
        project_ids={1},
        image_keys=set(),
    )

    assert orphans == []


def test_find_orphans_keeps_files_that_belong_to_image_rows() -> None:
    orphans = find_orphans(
        {"2": listing(images=["7.webp", "8.bmp"], thumbs=["7.webp", "8.webp"])},
        project_ids={2},
        image_keys={(2, 7, "webp"), (2, 8, "bmp")},
    )

    assert orphans == []


def test_find_orphans_matches_images_per_project() -> None:
    orphans = find_orphans(
        {"1": listing(images=["10.jpg"], thumbs=["10.webp"]), "2": listing(images=["10.jpg"])},
        project_ids={1, 2},
        image_keys={(1, 10, "jpg")},
    )

    assert orphans == [Path("2/images/10.jpg")]


def test_restart_removes_leftovers_and_keeps_real_files(settings: Settings) -> None:
    with make_client(settings) as first:
        project_id, image_id = create_project_with_image(first)
    root = settings.projects_dir
    real_original = root / str(project_id) / "images" / f"{image_id}.png"
    real_thumb = root / str(project_id) / "thumbs" / f"{image_id}.webp"
    stray_image = touch(root / str(project_id) / "images" / "999.jpg")
    stray_thumb = touch(root / str(project_id) / "thumbs" / "999.webp")
    leftover = touch(root / str(project_id) / ".incoming" / "x.tmp")
    foreign_name = touch(root / str(project_id) / "images" / "notes.txt")
    gone_project = touch(root / "424242" / "images" / "1.jpg")
    other_folder = touch(root / "backup" / "keep.txt")
    outside = touch(settings.data_dir / "other" / "keep.txt")
    db_bytes = settings.db_path.stat().st_size

    with make_client(settings) as second:
        assert second.get("/api/health").status_code == 200
        thumb = second.get(f"/api/projects/{project_id}/images/{image_id}/thumbnail")
        assert thumb.status_code == 200

    assert not stray_image.exists()
    assert not stray_thumb.exists()
    assert not leftover.exists()
    assert not gone_project.exists()
    assert not (root / "424242").exists()
    assert real_original.is_file()
    assert real_thumb.is_file()
    assert foreign_name.is_file()
    assert other_folder.is_file()
    assert outside.is_file()
    assert settings.db_path.is_file() and settings.db_path.stat().st_size >= db_bytes


def test_empty_projects_table_is_a_safety_valve_not_a_mass_delete(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    with make_client(settings):
        pass
    survivor = touch(settings.projects_dir / "3" / "images" / "1.jpg")
    incoming = touch(settings.projects_dir / "3" / ".incoming" / "a.tmp")

    with caplog.at_level(logging.INFO), make_client(settings) as client:
        assert client.get("/api/health").status_code == 200

    assert survivor.is_file()
    assert incoming.is_file()
    assert any(
        record.levelno >= logging.ERROR and record.name == storage.logger.name
        for record in caplog.records
    )


def test_startup_survives_a_failing_cleanup(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def boom(*args: object, **kwargs: object) -> int:
        raise RuntimeError("disk on fire")

    monkeypatch.setattr(main_module, "reconcile_orphans", boom)

    with caplog.at_level(logging.ERROR), make_client(settings) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert any(
        record.levelno >= logging.ERROR and "disk on fire" in str(record.exc_info)
        for record in caplog.records
    )


def test_symbolic_links_and_their_targets_survive_cleanup(
    settings: Settings, tmp_path: Path
) -> None:
    with make_client(settings) as first:
        project_id, _ = create_project_with_image(first)
    target = touch(tmp_path / "elsewhere" / "images" / "1.jpg")
    link = settings.projects_dir / "424242"
    make_dir_link(link, target.parent.parent)
    inner_target = tmp_path / "elsewhere_thumbs"
    touch(inner_target / "999.webp")
    inner_link = settings.projects_dir / str(project_id) / "thumbs_link"
    make_dir_link(inner_link, inner_target)

    with make_client(settings) as second:
        assert second.get("/api/health").status_code == 200

    assert os.path.lexists(link)
    assert target.is_file()
    assert os.path.lexists(inner_link)
    assert (inner_target / "999.webp").is_file()


def test_a_symlinked_subfolder_inside_a_known_project_is_not_followed(
    settings: Settings, tmp_path: Path
) -> None:
    with make_client(settings) as first:
        project_id, _ = create_project_with_image(first)
    victim = touch(tmp_path / "victim" / "999.webp")
    thumbs = settings.projects_dir / str(project_id) / "thumbs"
    for child in thumbs.iterdir():
        child.unlink()
    thumbs.rmdir()
    make_dir_link(thumbs, victim.parent)

    with make_client(settings):
        pass

    assert victim.is_file()


def test_reconcile_with_a_missing_projects_root_removes_nothing(settings: Settings) -> None:
    assert storage.scan_projects_root(settings.projects_dir) == {}
    assert storage.reconcile_orphans(settings, set(), set()) == 0


def test_reconcile_returns_the_number_of_removed_entries(settings: Settings) -> None:
    settings.projects_dir.mkdir(parents=True)
    touch(settings.projects_dir / "1" / ".incoming" / "a.tmp")
    touch(settings.projects_dir / "1" / ".incoming" / "b.tmp")
    touch(settings.projects_dir / "2" / "images" / "1.jpg")

    removed = storage.reconcile_orphans(settings, {1}, set())

    assert removed == 3
    assert not (settings.projects_dir / "2").exists()
    assert (settings.projects_dir / "1").is_dir()


def test_app_db_is_never_touched_by_cleanup(settings: Settings) -> None:
    with make_client(settings) as first:
        create_project_with_image(first)
    with make_client(settings):
        pass

    connection = sqlite3.connect(settings.db_path)
    try:
        assert connection.execute("SELECT COUNT(*) FROM images").fetchone()[0] == 1
    finally:
        connection.close()
