"""Pure label, `data.yaml` and manifest builders for a run's dataset (TRAN-03).

Nothing here touches the filesystem or the database, so it is unit-testable and
the api image needs no PyYAML.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from yolo_trainer_api.training.snapshot import Snapshot

SPLITS = ("train", "valid", "test")
MANIFEST_SCHEMA_VERSION = 1

# (class_index, x, y, w, h) with a normalized top-left origin.
Box = tuple[int, float, float, float, float]


def _unit(value: float) -> float:
    return min(1.0, max(0.0, value))


def label_rows(boxes: Iterable[Box], task_type: str) -> list[str]:
    """One YOLO label line per box.

    Detect: `class cx cy w h`. Segment: every box becomes a 4-point polygon in a
    fixed winding, because a segment dataset with box rows hard-fails in
    Ultralytics (Pitfall 3). Every coordinate is clamped to [0, 1].
    """
    rows: list[str] = []
    for index, x, y, w, h in boxes:
        left, top = _unit(x), _unit(y)
        right, bottom = _unit(x + w), _unit(y + h)
        if task_type == "segment":
            rows.append(
                f"{index} {left:.6f} {top:.6f} {right:.6f} {top:.6f} "
                f"{right:.6f} {bottom:.6f} {left:.6f} {bottom:.6f}"
            )
        else:
            center_x, center_y = _unit(x + w / 2), _unit(y + h / 2)
            rows.append(f"{index} {center_x:.6f} {center_y:.6f} {_unit(w):.6f} {_unit(h):.6f}")
    return rows


def data_yaml(class_names: list[str], has_test: bool) -> str:
    """The dataset yaml, without a `path:` key so the folder is relocatable.

    Ultralytics then roots the dataset at the yaml's own folder, which makes the
    same file valid in the api and the worker container. Class names are written
    as JSON-quoted scalars (valid YAML), which needs no PyYAML; `ensure_ascii=False`
    is required because the ASCII-escaped form breaks on astral characters.
    """
    lines = ["train: train/images", "val: valid/images"]
    if has_test:
        lines.append("test: test/images")
    lines.append("names:")
    lines.extend(
        f"  {index}: {json.dumps(name, ensure_ascii=False)}"
        for index, name in enumerate(class_names)
    )
    return "\n".join(lines) + "\n"


def manifest_dict(snapshot: Snapshot, created_at: datetime) -> dict:
    """The reproducibility record stored next to the dataset (D-19)."""
    order = {split: position for position, split in enumerate(SPLITS)}
    images = sorted(snapshot.images, key=lambda item: (order[item.split], item.image_id))
    counts = dict.fromkeys(SPLITS, 0)
    for item in images:
        counts[item.split] += 1
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "run_id": snapshot.run_id,
        "project_id": snapshot.project_id,
        "task_type": snapshot.task_type,
        "created_at": created_at.isoformat().replace("+00:00", "Z"),
        "classes": [
            {"index": item.index, "id": item.id, "name": item.name} for item in snapshot.classes
        ],
        "images": [
            {
                "image_id": item.image_id,
                "split": item.split,
                "filename": item.filename,
                "sha256": item.sha256,
                "ext": item.ext,
                "background": item.background,
                "boxes": [
                    {"class_index": index, "x": x, "y": y, "w": w, "h": h}
                    for index, x, y, w, h in item.boxes
                ],
            }
            for item in images
        ],
        "counts": counts,
        "excluded_unannotated": {
            split: snapshot.excluded_unannotated.get(split, 0) for split in SPLITS
        },
        "settings": snapshot.settings,
    }
