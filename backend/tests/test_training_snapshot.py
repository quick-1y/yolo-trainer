"""The run's dataset snapshot: complete, consistent, linked and immutable (TRAN-03, D-19, D-20).

Everything goes through the real api (TestClient over a temp-file SQLite database); a
few tests reach into the snapshot module through `monkeypatch` to force the failure
paths (a failing `os.link`, a vanished source image, a concurrent writer).
"""

from __future__ import annotations

import errno
import hashlib
import json
import os
import sqlite3
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yolo_trainer_api import storage
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service, snapshot
from yolo_trainer_common import layout

from .training_helpers import XHR, set_split, setup_project, start_run, wait_status


def _project_image(settings: Settings, project_id: int, image_id: int, ext: str = "png") -> Path:
    return storage.image_file(settings.data_dir / "projects", project_id, image_id, ext)


def _queued(client: TestClient, project_id: int, **overrides: object) -> dict:
    started = start_run(client, project_id, **overrides)
    return wait_status(client, project_id, started["id"], {"queued"})


def _tree_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def _manifest(settings: Settings, run_id: int) -> dict:
    path = layout.dataset_dir(settings.data_dir, run_id) / layout.MANIFEST_FILE
    return json.loads(path.read_text(encoding="utf-8"))


def _db_rows(settings: Settings, query: str, args: tuple = ()) -> list[tuple]:
    connection = sqlite3.connect(settings.db_path)
    try:
        return connection.execute(query, args).fetchall()
    finally:
        connection.close()


# --------------------------------------------------------------------------
# Hard links and the copy fallback (D-19)
# --------------------------------------------------------------------------


def test_snapshot_images_are_the_same_files_as_the_project_images(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Linked", train=2, valid=1, test=1)

    run = _queued(client, ids["project_id"])

    dataset = layout.dataset_dir(settings.data_dir, run["id"])
    wanted = {"train": ids["train"], "valid": ids["valid"], "test": ids["test"]}
    for split, image_ids in wanted.items():
        for image_id in image_ids:
            linked = dataset / split / "images" / f"{image_id}.png"
            source = _project_image(settings, ids["project_id"], image_id)
            assert os.path.samefile(linked, source)
            assert linked.stat().st_nlink >= 2


def test_a_failing_link_falls_back_to_a_byte_identical_copy_and_the_run_is_queued(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    ids = setup_project(client, "Copied", train=1, valid=1)

    def cross_device(src: object, dst: object) -> None:
        raise OSError(errno.EXDEV, "Invalid cross-device link")

    monkeypatch.setattr(snapshot.os, "link", cross_device)

    run = _queued(client, ids["project_id"])

    dataset = layout.dataset_dir(settings.data_dir, run["id"])
    for split, image_id in (("train", ids["train"][0]), ("valid", ids["valid"][0])):
        copied = dataset / split / "images" / f"{image_id}.png"
        source = _project_image(settings, ids["project_id"], image_id)
        assert copied.read_bytes() == source.read_bytes()
        assert copied.stat().st_nlink == 1
        assert not os.path.samefile(copied, source)


def test_link_or_copy_reports_whether_it_linked(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    source.write_bytes(b"pixels")

    linked = snapshot.link_or_copy(source, tmp_path / "linked.png")

    assert linked is True
    assert (tmp_path / "linked.png").stat().st_nlink == 2


def test_replacing_a_snapshot_file_never_writes_through_into_the_project_image(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.png"
    source.write_bytes(b"original")
    target = tmp_path / "target.png"
    snapshot.link_or_copy(source, target)

    snapshot.link_or_copy(source, target)  # a second pass over an existing hard link

    assert source.read_bytes() == b"original"
    assert target.read_bytes() == b"original"


# --------------------------------------------------------------------------
# What the manifest records (D-19, D-04)
# --------------------------------------------------------------------------


def test_the_manifest_lists_every_usable_image_with_its_stored_hash_and_filename(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Manifest", train=2, valid=1, test=1, unannotated=2, unassigned=1)
    # one unannotated image sits in Valid, one stays in Train
    assert set_split(client, ids["project_id"], [ids["unannotated"][1]], "valid").status_code == 200

    run = _queued(client, ids["project_id"])

    manifest = _manifest(settings, run["id"])
    stored = {
        row[0]: (row[1], row[2])
        for row in _db_rows(
            settings,
            "SELECT id, original_filename, sha256 FROM images WHERE project_id = ?",
            (ids["project_id"],),
        )
    }
    listed = {item["image_id"] for item in manifest["images"]}
    assert listed == {*ids["train"], *ids["valid"], *ids["test"]}
    assert ids["unassigned"][0] not in listed  # never materialized (D-04)
    for item in manifest["images"]:
        filename, sha256 = stored[item["image_id"]]
        assert (item["filename"], item["sha256"]) == (filename, sha256)
        assert item["box_count"] == 1 and item["background"] is False
        dataset = layout.dataset_dir(settings.data_dir, run["id"])
        copied = dataset / item["split"] / "images" / f"{item['image_id']}.{item['ext']}"
        assert hashlib.sha256(copied.read_bytes()).hexdigest() == item["sha256"]
    assert manifest["excluded_unannotated"] == {"train": 1, "valid": 1, "test": 0}
    assert manifest["counts"] == {"train": 2, "valid": 1, "test": 1}
    assert manifest["counts"] == run["dataset_counts"]


def test_a_background_image_is_materialized_with_a_zero_byte_label(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Empty", train=1, valid=1, background=1)

    run = _queued(client, ids["project_id"])

    dataset = layout.dataset_dir(settings.data_dir, run["id"])
    label = dataset / "train" / "labels" / f"{ids['background'][0]}.txt"
    assert label.exists() and label.stat().st_size == 0
    entry = next(
        item
        for item in _manifest(settings, run["id"])["images"]
        if item["image_id"] == ids["background"][0]
    )
    assert entry["background"] is True and entry["box_count"] == 0


def test_a_project_with_only_train_and_valid_has_no_test_folder_or_key(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "TwoSplits", train=1, valid=1)

    run = _queued(client, ids["project_id"])

    dataset = layout.dataset_dir(settings.data_dir, run["id"])
    assert not (dataset / "test").exists()
    assert "test:" not in (dataset / layout.DATA_YAML).read_text(encoding="utf-8")
    assert run["dataset_counts"] == {"train": 1, "valid": 1, "test": 0}


def test_a_segment_project_writes_polygon_rows_only(client: TestClient, settings: Settings) -> None:
    ids = setup_project(
        client, "Polygons", task_type="segment", train=2, valid=1, background=1, classes=("a", "b")
    )

    run = _queued(client, ids["project_id"], base={"kind": "official", "name": "yolo26n-seg"})

    dataset = layout.dataset_dir(settings.data_dir, run["id"])
    rows = [
        line
        for label in dataset.rglob("*.txt")
        for line in label.read_text(encoding="utf-8").splitlines()
    ]
    assert len(rows) == 3
    assert all(len(row.split()) == 9 for row in rows)  # class index + four corners


def test_another_projects_images_and_classes_never_enter_the_snapshot(
    client: TestClient, settings: Settings
) -> None:
    mine = setup_project(client, "Mine", train=1, valid=1, classes=("car",))
    setup_project(client, "Other", train=2, valid=2, test=1, classes=("plane", "ship"))

    run = _queued(client, mine["project_id"])

    manifest = _manifest(settings, run["id"])
    assert {item["image_id"] for item in manifest["images"]} == {*mine["train"], *mine["valid"]}
    assert [item["name"] for item in manifest["classes"]] == ["car"]
    assert run["class_names"] == ["car"]
    assert run["dataset_counts"] == {"train": 1, "valid": 1, "test": 0}


# --------------------------------------------------------------------------
# Immutability after Start (D-20, success criterion 5)
# --------------------------------------------------------------------------


def test_project_edits_after_start_never_change_the_run_dataset(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Frozen", train=2, valid=1, classes=("car", "plate"))
    project_id = ids["project_id"]
    run = _queued(client, project_id)
    dataset = layout.dataset_dir(settings.data_dir, run["id"])
    before = _tree_hashes(dataset)
    assert len(before) > 6
    expected_counts, expected_names = run["dataset_counts"], run["class_names"]
    doomed = ids["train"][0]
    doomed_snapshot = dataset / "train" / "images" / f"{doomed}.png"
    doomed_bytes = doomed_snapshot.read_bytes()

    def move_a_box() -> None:
        url = f"/api/projects/{project_id}/images/{ids['valid'][0]}/annotations"
        version = client.get(url).json()["version"]
        body = {
            "base_version": version,
            "is_background": False,
            "is_reviewed": True,
            "boxes": [
                {
                    "id": str(uuid.uuid4()),
                    "class_id": ids["class_ids"][1],
                    "x": 0.05,
                    "y": 0.05,
                    "w": 0.1,
                    "h": 0.1,
                }
            ],
        }
        assert client.put(url, json=body, headers=XHR).status_code == 200

    def rename_a_class() -> None:
        url = f"/api/projects/{project_id}/classes/{ids['class_ids'][0]}"
        assert client.patch(url, json={"name": "automobile"}, headers=XHR).status_code == 200

    def change_a_split() -> None:
        assert set_split(client, project_id, [ids["train"][1]], "test").status_code == 200

    def delete_a_class() -> None:
        url = f"/api/projects/{project_id}/classes/{ids['class_ids'][0]}"
        assert client.delete(url, headers=XHR).status_code == 204

    def delete_an_image() -> None:
        response = client.post(
            f"/api/projects/{project_id}/images/delete", json={"ids": [doomed]}, headers=XHR
        )
        assert response.status_code == 200

    for name, edit in (
        ("move a box", move_a_box),
        ("rename a class", rename_a_class),
        ("change a split", change_a_split),
        ("delete a class", delete_a_class),
        ("delete an image", delete_an_image),
    ):
        edit()
        assert _tree_hashes(dataset) == before, f"the dataset changed after: {name}"
        current = client.get(f"/api/projects/{project_id}/runs/{run['id']}").json()
        assert current["dataset_counts"] == expected_counts, name
        assert current["class_names"] == expected_names, name

    assert not _project_image(settings, project_id, doomed).exists()
    assert doomed_snapshot.read_bytes() == doomed_bytes  # still readable through its link
    assert _manifest(settings, run["id"])["classes"][0]["name"] == "car"


# --------------------------------------------------------------------------
# A source image that disappears before materialization
# --------------------------------------------------------------------------


def test_a_source_image_deleted_before_materialization_fails_the_run_and_leaves_no_folder(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    ids = setup_project(client, "Vanishing", train=2, valid=1)
    real_link_or_copy = snapshot.link_or_copy
    victim = _project_image(settings, ids["project_id"], ids["train"][1])

    def delete_one_source_first(src: Path, dst: Path) -> bool:
        victim.unlink(missing_ok=True)
        return real_link_or_copy(src, dst)

    monkeypatch.setattr(snapshot, "link_or_copy", delete_one_source_first)

    started = start_run(client, ids["project_id"])

    run = client.get(f"/api/projects/{ids['project_id']}/runs/{started['id']}").json()
    assert run["status"] == "failed"
    assert run["error_message"] == service.PREPARE_SOURCE_MISSING_DETAIL
    assert not layout.run_dir(settings.data_dir, started["id"]).exists()
    # the images that were already linked are still in the project
    assert _project_image(settings, ids["project_id"], ids["train"][0]).exists()
    assert _project_image(settings, ids["project_id"], ids["valid"][0]).exists()


# --------------------------------------------------------------------------
# Consistent capture (Pitfall 8)
# --------------------------------------------------------------------------


def _try_concurrent_write(settings: Settings, new_x: float) -> str:
    """Write from a second connection without waiting; the message of the error it gets."""
    connection = sqlite3.connect(settings.db_path, timeout=0)
    try:
        connection.execute("UPDATE annotations SET x = ?", (new_x,))
        connection.commit()
    except sqlite3.OperationalError as error:
        return str(error)
    finally:
        connection.close()
    return "written"


def test_a_concurrent_annotation_write_cannot_interleave_with_the_capture(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    ids = setup_project(client, "Locked", train=1, valid=1)
    outcomes: list[str] = []
    real_capture = service.capture_snapshot

    async def capture_after_a_write_attempt(*args: object, **kwargs: object):
        outcomes.append(_try_concurrent_write(settings, 0.9))
        return await real_capture(*args, **kwargs)

    def write_between_the_reads() -> None:
        outcomes.append(_try_concurrent_write(settings, 0.9))

    monkeypatch.setattr(service, "capture_snapshot", capture_after_a_write_attempt)
    monkeypatch.setattr(snapshot, "_after_image_select", write_between_the_reads)

    run = _queued(client, ids["project_id"])

    assert len(outcomes) == 2
    assert all("database is locked" in outcome for outcome in outcomes), outcomes
    dataset = layout.dataset_dir(settings.data_dir, run["id"])
    label = (dataset / "train" / "labels" / f"{ids['train'][0]}.txt").read_text(encoding="utf-8")
    assert label.split() == ["0", "0.500000", "0.500000", "0.500000", "0.500000"]
    stored_x = {row[0] for row in _db_rows(settings, "SELECT x FROM annotations")}
    assert stored_x == {0.25}  # the attempted write changed nothing
