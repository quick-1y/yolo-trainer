"""Dataset snapshot of a run: consistent capture, then background materialization.

`capture_snapshot` runs inside the transaction that inserted the run row, so the
SQLite write lock is already held and the reads below see the project exactly as
it was when Start was pressed (D-20, Pitfall 8). `materialize` then builds the
YOLO dataset folder from that in-memory snapshot - no database access, no torch -
so it can run in a thread after the HTTP response (Pitfall 4).
"""

from __future__ import annotations

import os
import shutil
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api import storage
from yolo_trainer_api.models import Annotation, Image, ProjectClass
from yolo_trainer_api.training import labels
from yolo_trainer_common import layout


class SnapshotSourceMissing(Exception):
    """A project image vanished between the snapshot and its materialization."""


@dataclass(frozen=True)
class SnapshotClass:
    id: int
    name: str
    index: int


@dataclass(frozen=True)
class SnapshotImage:
    image_id: int
    ext: str
    split: str
    filename: str
    sha256: str
    background: bool
    boxes: list[labels.Box] = field(default_factory=list)


@dataclass(frozen=True)
class Snapshot:
    run_id: int
    project_id: int
    task_type: str
    classes: list[SnapshotClass]
    images: list[SnapshotImage]
    excluded_unannotated: dict[str, int]
    settings: dict

    def usable_counts(self) -> dict[str, int]:
        counts = dict.fromkeys(labels.SPLITS, 0)
        for item in self.images:
            counts[item.split] += 1
        return counts


def _after_image_select() -> None:
    """Test seam: called between the image and the annotation selects, does nothing.

    The consistency test replaces it with a second connection's write attempt to prove
    the run INSERT's write lock is still held between the two reads (Pitfall 8).
    """


async def capture_snapshot(
    session: AsyncSession, project_id: int, run_id: int, task_type: str, settings: dict
) -> Snapshot:
    """Read the project's classes, split images and boxes inside the caller's transaction.

    Only images with a split are read (unassigned ones are never used, D-04). An
    image is usable when it is flagged background or has at least one box; an
    unannotated image with a split is excluded and counted per split (ANNO-10).
    """
    class_rows = (
        await session.execute(
            select(ProjectClass.id, ProjectClass.name)
            .where(ProjectClass.project_id == project_id)
            .order_by(ProjectClass.position, ProjectClass.id)
        )
    ).all()
    classes = [
        SnapshotClass(id=row.id, name=row.name, index=index) for index, row in enumerate(class_rows)
    ]
    class_index = {item.id: item.index for item in classes}

    image_rows = (
        await session.execute(
            select(
                Image.id,
                Image.ext,
                Image.original_filename,
                Image.sha256,
                Image.split,
                Image.is_background,
            )
            .where(Image.project_id == project_id, Image.split.is_not(None))
            .order_by(Image.id)
        )
    ).all()
    _after_image_select()

    boxes_by_image: dict[int, list[labels.Box]] = {}
    annotation_rows = await session.execute(
        select(
            Annotation.image_id,
            Annotation.class_id,
            Annotation.x,
            Annotation.y,
            Annotation.w,
            Annotation.h,
        )
        .join(Image, Image.id == Annotation.image_id)
        .where(Image.project_id == project_id, Image.split.is_not(None))
        .order_by(Annotation.image_id, Annotation.position, Annotation.id)
    )
    for row in annotation_rows:
        index = class_index.get(row.class_id)
        if index is None:  # a class of another project cannot be saved; be defensive anyway
            continue
        boxes_by_image.setdefault(row.image_id, []).append((index, row.x, row.y, row.w, row.h))

    images: list[SnapshotImage] = []
    excluded = dict.fromkeys(labels.SPLITS, 0)
    for row in image_rows:
        boxes = boxes_by_image.get(row.id, [])
        if not row.is_background and not boxes:
            excluded[row.split] += 1
            continue
        images.append(
            SnapshotImage(
                image_id=row.id,
                ext=row.ext,
                split=row.split,
                filename=row.original_filename,
                sha256=row.sha256,
                background=bool(row.is_background),
                boxes=boxes,
            )
        )
    return Snapshot(
        run_id=run_id,
        project_id=project_id,
        task_type=task_type,
        classes=classes,
        images=images,
        excluded_unannotated=excluded,
        settings=settings,
    )


def link_or_copy(src: Path, dst: Path) -> bool:
    """Hard-link `src` to `dst`, copying when linking fails; True when linked (D-19).

    A vanished source raises `SnapshotSourceMissing`. `dst` is removed first: copying
    over an existing hard link would write through it into the project image.
    """
    dst.unlink(missing_ok=True)
    try:
        os.link(src, dst)
    except FileNotFoundError:
        if not src.exists():
            raise SnapshotSourceMissing(str(src)) from None
        raise
    except OSError:
        try:
            shutil.copy2(src, dst)
        except FileNotFoundError:
            raise SnapshotSourceMissing(str(src)) from None
        return False
    return True


def _materialize_image(
    data_dir: Path, dataset: Path, snapshot: Snapshot, item: SnapshotImage
) -> None:
    source = storage.image_file(data_dir / "projects", snapshot.project_id, item.image_id, item.ext)
    split_dir = dataset / item.split
    link_or_copy(source, split_dir / "images" / f"{item.image_id}.{item.ext}")
    rows = labels.label_rows(item.boxes, snapshot.task_type)
    text = "\n".join(rows) + "\n" if rows else ""  # background: a zero-byte file
    layout.write_text_atomic(split_dir / "labels" / f"{item.image_id}.txt", text)


def materialize(data_dir: Path, snapshot: Snapshot, max_workers: int = 8) -> None:
    """Build `runs/<id>/dataset/`, `job.json` and the manifest from the snapshot.

    Synchronous, meant for a worker thread. Raises `SnapshotSourceMissing` when a
    project image disappeared; the caller then removes the folder.
    """
    run_directory = layout.run_dir(data_dir, snapshot.run_id)
    dataset = layout.dataset_dir(data_dir, snapshot.run_id)
    present = {item.split for item in snapshot.images}
    for split in labels.SPLITS:
        if split in present:
            (dataset / split / "images").mkdir(parents=True, exist_ok=True)
            (dataset / split / "labels").mkdir(parents=True, exist_ok=True)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        for _ in pool.map(
            lambda item: _materialize_image(data_dir, dataset, snapshot, item), snapshot.images
        ):
            pass

    class_names = [item.name for item in snapshot.classes]
    layout.write_text_atomic(
        dataset / layout.DATA_YAML, labels.data_yaml(class_names, has_test="test" in present)
    )
    layout.write_json_atomic(
        dataset / layout.MANIFEST_FILE, labels.manifest_dict(snapshot, datetime.now(UTC))
    )
    base = snapshot.settings["base"]
    layout.write_json_atomic(
        run_directory / layout.JOB_FILE,
        {
            "schema_version": 1,
            "run_id": snapshot.run_id,
            "task_type": snapshot.task_type,
            "base": {"kind": base["kind"], "name": base["name"], "model_id": base.get("model_id")},
            "settings": {
                key: snapshot.settings[key] for key in ("epochs", "imgsz", "batch", "device")
            },
        },
    )
