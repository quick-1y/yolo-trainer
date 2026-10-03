"""On-disk layout for project images (D-18).

Every path is built from integers and an allow-listed extension only; a
user-supplied filename never reaches the filesystem.
"""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from yolo_trainer_api.image_processing import EXT_MEDIA, Rejected
from yolo_trainer_api.settings import Settings

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 1024 * 1024


def project_dir(settings: Settings, project_id: int) -> Path:
    return settings.projects_dir / str(int(project_id))


def images_dir(settings: Settings, project_id: int) -> Path:
    return project_dir(settings, project_id) / "images"


def thumbs_dir(settings: Settings, project_id: int) -> Path:
    return project_dir(settings, project_id) / "thumbs"


def incoming_dir(settings: Settings, project_id: int) -> Path:
    return project_dir(settings, project_id) / ".incoming"


def image_path(settings: Settings, project_id: int, image_id: int, ext: str) -> Path:
    if ext not in EXT_MEDIA:
        raise ValueError(f"Unsupported image extension: {ext!r}")
    return images_dir(settings, project_id) / f"{int(image_id)}.{ext}"


def thumb_path(settings: Settings, project_id: int, image_id: int) -> Path:
    return thumbs_dir(settings, project_id) / f"{int(image_id)}.webp"


def discard(path: Path | None) -> None:
    """Delete a file if it exists; never raises for a missing file."""
    if path is not None:
        path.unlink(missing_ok=True)


def stage_and_hash(settings: Settings, project_id: int, fileobj: BinaryIO) -> tuple[Path, str, int]:
    """Copy `fileobj` into the project's staging dir while hashing it.

    Returns `(staged_path, sha256_hex, size_bytes)`. The copy stops as soon as
    the per-file cap is exceeded: the partial file is removed and `Rejected`
    is raised. Runs in a worker thread (blocking I/O).
    """
    directory = incoming_dir(settings, project_id)
    directory.mkdir(parents=True, exist_ok=True)
    staged = directory / f"{uuid4().hex}.tmp"
    digest = hashlib.sha256()
    total = 0
    try:
        with staged.open("wb") as target:
            while chunk := fileobj.read(_CHUNK_SIZE):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise Rejected(f"The file is larger than {settings.max_upload_mb} MB.")
                digest.update(chunk)
                target.write(chunk)
    except BaseException:
        discard(staged)
        raise
    return staged, digest.hexdigest(), total


def write_thumb_tmp(settings: Settings, project_id: int, data: bytes) -> Path:
    directory = incoming_dir(settings, project_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{uuid4().hex}.tmp"
    try:
        path.write_bytes(data)
    except BaseException:
        discard(path)
        raise
    return path


def commit_files(
    settings: Settings,
    project_id: int,
    image_id: int,
    ext: str,
    staged: Path,
    thumb_tmp: Path,
) -> None:
    """Move the staged original and thumbnail to their final id-keyed names."""
    final_image = image_path(settings, project_id, image_id, ext)
    final_thumb = thumb_path(settings, project_id, image_id)
    final_image.parent.mkdir(parents=True, exist_ok=True)
    final_thumb.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staged, final_image)
    os.replace(thumb_tmp, final_thumb)


def remove_image_files(settings: Settings, project_id: int, image_id: int, ext: str) -> None:
    discard(image_path(settings, project_id, image_id, ext))
    discard(thumb_path(settings, project_id, image_id))


def remove_project_dir(settings: Settings, project_id: int) -> None:
    """Delete a project's whole folder (D-19). A missing folder is fine.

    Refuses to act unless the target is a direct, non-symlink child of
    `settings.projects_dir` (T2-08-02); the path is built from an integer id.
    """
    target = project_dir(settings, project_id)
    if target.parent != settings.projects_dir:
        raise ValueError(f"Refusing to remove {target}: not a direct child of the projects root")
    if target.is_symlink():
        raise ValueError(f"Refusing to remove {target}: it is a symbolic link")
    if not target.exists():
        return
    shutil.rmtree(target)


@dataclass
class ProjectDirListing:
    """Plain names found directly inside one child of the projects root."""

    is_symlink: bool = False
    images: list[str] = field(default_factory=list)
    thumbs: list[str] = field(default_factory=list)
    incoming: list[str] = field(default_factory=list)


def scan_projects_root(projects_root: Path) -> dict[str, ProjectDirListing]:
    return {}


def find_orphans(
    listing: dict[str, ProjectDirListing],
    project_ids: set[int],
    image_keys: set[tuple[int, int, str]],
) -> list[Path]:
    return []


def reconcile_orphans(
    settings: Settings, project_ids: set[int], image_keys: set[tuple[int, int, str]]
) -> int:
    return 0
