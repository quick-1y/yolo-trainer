"""Label rows, `data.yaml`, the manifest and the official catalog (TRAN-03, D-07, D-13, D-19).

Pure functions only: nothing here touches the database or the filesystem. PyYAML is
imported by the tests alone (it ships with Ultralytics); the application code must
not need it, which `test_labels_module_needs_no_pyyaml` pins.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path

import pytest
import yaml
from ultralytics.utils.downloads import GITHUB_ASSETS_NAMES

from yolo_trainer_api.training import labels
from yolo_trainer_api.training.catalog import OFFICIAL_FAMILIES, OFFICIAL_SIZES, official_models
from yolo_trainer_api.training.labels import data_yaml, label_rows, manifest_dict
from yolo_trainer_api.training.snapshot import Snapshot, SnapshotClass, SnapshotImage

TRICKY_NAMES = [
    "грузовик",
    'a"b',
    "back\\slash",
    "\U0001f697",
    "yes",
    "null",
    "123",
    "a: b",
    "#hash",
    "it's",
]

CREATED_AT = datetime(2026, 10, 10, 12, 0, 0, tzinfo=UTC)


def _image(image_id: int, split: str, boxes: list | None = None, background: bool = False):
    return SnapshotImage(
        image_id=image_id,
        ext="png",
        split=split,
        filename=f"photo-{image_id}.png",
        sha256=f"{image_id:x}" * 64,
        background=background,
        boxes=boxes if boxes is not None else [(0, 0.1, 0.1, 0.2, 0.2)],
    )


def _snapshot(images: list[SnapshotImage], classes: list[str] | None = None) -> Snapshot:
    names = classes if classes is not None else ["car", "plate"]
    return Snapshot(
        run_id=7,
        project_id=3,
        task_type="detect",
        classes=[
            SnapshotClass(id=40 + index, name=name, index=index) for index, name in enumerate(names)
        ],
        images=images,
        excluded_unannotated={"train": 2},
        settings={
            "base": {"kind": "official", "name": "yolo26n", "model_id": None},
            "epochs": 3,
            "imgsz": 64,
            "batch": 2,
            "device": "cpu",
        },
    )


# --------------------------------------------------------------------------
# Label rows (D-13, P3 D-18)
# --------------------------------------------------------------------------


def test_detect_row_is_class_then_center_and_size_with_six_decimals() -> None:
    assert label_rows([(1, 0.1, 0.2, 0.3, 0.4)], "detect") == [
        "1 0.250000 0.400000 0.300000 0.400000"
    ]


def test_segment_row_is_the_four_corners_in_a_fixed_winding() -> None:
    assert label_rows([(1, 0.1, 0.2, 0.3, 0.4)], "segment") == [
        "1 0.100000 0.200000 0.400000 0.200000 0.400000 0.600000 0.100000 0.600000"
    ]


@pytest.mark.parametrize("task_type", ["detect", "segment"])
def test_a_box_touching_the_image_edge_never_exceeds_one(task_type: str) -> None:
    (row,) = label_rows([(0, 0.5, 0.5, 0.5, 0.5)], task_type)

    values = [float(value) for value in row.split()[1:]]
    assert max(values) <= 1.0 and min(values) >= 0.0


@pytest.mark.parametrize("task_type", ["detect", "segment"])
def test_a_float_rounding_overshoot_is_clamped_to_exactly_one(task_type: str) -> None:
    # x + w = 1.0000004 for the corner form; w itself overshoots for the center form
    (row,) = label_rows([(0, 0.0, 0.0, 1.0000004, 1.0000004)], task_type)

    values = [float(value) for value in row.split()[1:]]
    assert max(values) == 1.0
    assert "1.000000" in row.split()


def test_two_identical_boxes_are_both_written_in_input_order() -> None:
    boxes = [(0, 0.1, 0.1, 0.2, 0.2), (1, 0.5, 0.5, 0.2, 0.2), (0, 0.1, 0.1, 0.2, 0.2)]

    rows = label_rows(boxes, "detect")

    assert len(rows) == 3
    assert rows[0] == rows[2] and rows[0] != rows[1]
    assert [row.split()[0] for row in rows] == ["0", "1", "0"]


def test_no_boxes_yield_no_rows() -> None:
    assert label_rows([], "detect") == [] and label_rows([], "segment") == []


# --------------------------------------------------------------------------
# data.yaml (D-19)
# --------------------------------------------------------------------------


def test_data_yaml_without_a_test_split_has_train_and_val_only() -> None:
    loaded = yaml.safe_load(data_yaml(["car", "plate"], has_test=False))

    assert loaded == {
        "train": "train/images",
        "val": "valid/images",
        "names": {0: "car", 1: "plate"},
    }
    assert "test" not in loaded and "path" not in loaded


def test_data_yaml_with_a_test_split_adds_the_test_key() -> None:
    loaded = yaml.safe_load(data_yaml(["car"], has_test=True))

    assert loaded["test"] == "test/images"
    assert "path" not in loaded


def test_data_yaml_round_trips_awkward_class_names_exactly() -> None:
    loaded = yaml.safe_load(data_yaml(TRICKY_NAMES, has_test=True))

    assert loaded["names"] == dict(enumerate(TRICKY_NAMES))
    assert all(isinstance(name, str) for name in loaded["names"].values())


def test_labels_module_needs_no_pyyaml() -> None:
    source = Path(labels.__file__).read_text(encoding="utf-8")

    assert not re.search(r"^\s*(import yaml|from yaml)", source, flags=re.MULTILINE)


# --------------------------------------------------------------------------
# manifest.json (D-19)
# --------------------------------------------------------------------------


def test_manifest_orders_images_by_split_then_id_and_classes_by_index() -> None:
    shuffled = [
        _image(9, "test"),
        _image(4, "valid"),
        _image(8, "train"),
        _image(2, "test"),
        _image(3, "train"),
        _image(5, "valid"),
    ]

    manifest = manifest_dict(_snapshot(shuffled), CREATED_AT)

    assert [(item["split"], item["image_id"]) for item in manifest["images"]] == [
        ("train", 3),
        ("train", 8),
        ("valid", 4),
        ("valid", 5),
        ("test", 2),
        ("test", 9),
    ]
    assert [item["index"] for item in manifest["classes"]] == [0, 1]
    assert [item["name"] for item in manifest["classes"]] == ["car", "plate"]
    assert manifest["counts"] == {"train": 2, "valid": 2, "test": 2}


def test_manifest_describes_every_image_and_the_run_settings() -> None:
    images = [
        _image(1, "train", boxes=[(0, 0.1, 0.1, 0.2, 0.2), (1, 0.5, 0.5, 0.2, 0.2)]),
        _image(2, "valid", boxes=[], background=True),
    ]

    manifest = manifest_dict(_snapshot(images), CREATED_AT)

    first, second = manifest["images"]
    assert first["image_id"] == 1 and first["split"] == "train"
    assert first["filename"] == "photo-1.png" and first["ext"] == "png"
    assert first["sha256"] == "1" * 64
    assert first["background"] is False and first["box_count"] == 2
    assert second["background"] is True and second["box_count"] == 0
    assert manifest["excluded_unannotated"] == {"train": 2, "valid": 0, "test": 0}
    assert manifest["settings"]["epochs"] == 3 and manifest["settings"]["base"]["name"] == "yolo26n"
    assert manifest["created_at"] == "2026-10-10T12:00:00Z"
    assert (manifest["run_id"], manifest["project_id"], manifest["task_type"]) == (7, 3, "detect")


def test_manifest_is_deterministic_for_equal_input() -> None:
    forward = [_image(1, "train"), _image(2, "valid"), _image(3, "test")]
    backward = list(reversed(forward))

    first = json.dumps(manifest_dict(_snapshot(forward), CREATED_AT), sort_keys=True)
    second = json.dumps(manifest_dict(_snapshot(backward), CREATED_AT), sort_keys=True)

    assert first == second


# --------------------------------------------------------------------------
# Official catalog (D-07)
# --------------------------------------------------------------------------


@pytest.mark.parametrize("task_type", ["detect", "segment"])
def test_every_official_name_is_a_real_ultralytics_asset(task_type: str) -> None:
    models = official_models(task_type)

    assert len(models) == 10
    assert len(models) == len(OFFICIAL_FAMILIES) * len(OFFICIAL_SIZES)
    missing = [name for name, _size in models if f"{name}.pt" not in GITHUB_ASSETS_NAMES]
    assert missing == []
    assert all(name.endswith("-seg") == (task_type == "segment") for name, _size in models)


def test_the_two_task_types_together_list_twenty_distinct_names() -> None:
    names = {name for task in ("detect", "segment") for name, _size in official_models(task)}

    assert len(names) == 20
