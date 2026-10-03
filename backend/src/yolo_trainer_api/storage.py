"""On-disk layout for project images (D-18).

Every path is built from integers and an allow-listed extension only; a
user-supplied filename never reaches the filesystem.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
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


def _is_link(path: str | os.PathLike[str]) -> bool:
    """True for a symbolic link or a Windows junction (never followed)."""
    return os.path.islink(path) or os.path.isjunction(path)


def _plain_file_names(directory: Path) -> list[str]:
    """Names of the regular files directly inside `directory`.

    Missing or non-directory paths, symbolic links/junctions (also as the
    directory itself), nested directories and non-regular entries are skipped.
    """
    try:
        if _is_link(directory) or not directory.is_dir():
            return []
        with os.scandir(directory) as entries:
            return [
                entry.name
                for entry in entries
                if entry.is_file(follow_symlinks=False) and not entry.is_junction()
            ]
    except OSError:
        logger.warning("Could not list %s during orphan cleanup", directory, exc_info=True)
        return []


def scan_projects_root(projects_root: Path) -> dict[str, ProjectDirListing]:
    """List the children of `projects_root` without following any link.

    Real directories get the plain file names of `images/`, `thumbs/` and
    `.incoming/` (non-recursive); links are recorded as such and not entered;
    plain files at the root are ignored. A missing root yields `{}`.
    """
    result: dict[str, ProjectDirListing] = {}
    try:
        with os.scandir(projects_root) as entries:
            children = [
                (entry.name, entry.path, entry.is_symlink() or entry.is_junction())
                for entry in entries
                if entry.is_symlink() or entry.is_junction() or entry.is_dir(follow_symlinks=False)
            ]
    except FileNotFoundError:
        return result
    except OSError:
        logger.warning("Could not list %s during orphan cleanup", projects_root, exc_info=True)
        return result
    for name, path, is_link in children:
        if is_link:
            result[name] = ProjectDirListing(is_symlink=True)
            continue
        base = Path(path)
        result[name] = ProjectDirListing(
            images=_plain_file_names(base / "images"),
            thumbs=_plain_file_names(base / "thumbs"),
            incoming=_plain_file_names(base / ".incoming"),
        )
    return result


_IMAGE_FILE = re.compile(r"^([0-9]+)\.(" + "|".join(sorted(EXT_MEDIA)) + r")$")
_THUMB_FILE = re.compile(r"^([0-9]+)\.webp$")
_PROJECT_DIR = re.compile(r"^[0-9]+$")


def _project_id_of(name: str) -> int | None:
    """The project id for a canonical decimal dir name ("7", never "007"), else None."""
    if not _PROJECT_DIR.match(name):
        return None
    number = int(name)
    return number if str(number) == name else None


def find_orphans(
    listing: dict[str, ProjectDirListing],
    project_ids: set[int],
    image_keys: set[tuple[int, int, str]],
) -> list[Path]:
    """Decide which entries under the projects root belong to no database row.

    PURE: no I/O. Returns paths relative to the projects root. Only names that
    match the app's own id patterns are ever reported; everything else, and
    every link, is ignored (T2-08-01).
    """
    image_ids = {(project_id, image_id) for project_id, image_id, _ in image_keys}
    orphans: list[Path] = []
    for dir_name, entry in listing.items():
        project_id = _project_id_of(dir_name)
        if project_id is None or entry.is_symlink:
            continue
        if project_id not in project_ids:
            orphans.append(Path(dir_name))
            continue
        for name in entry.images:
            match = _IMAGE_FILE.match(name)
            if match and (project_id, int(match.group(1)), match.group(2)) not in image_keys:
                orphans.append(Path(dir_name) / "images" / name)
        for name in entry.thumbs:
            match = _THUMB_FILE.match(name)
            if match and (project_id, int(match.group(1))) not in image_ids:
                orphans.append(Path(dir_name) / "thumbs" / name)
        orphans.extend(Path(dir_name) / ".incoming" / name for name in entry.incoming)
    return orphans


def _remove_orphan(projects_root: Path, relative: Path) -> bool:
    """Delete one orphan; refuses links and anything outside `projects_root`."""
    if relative.is_absolute() or ".." in relative.parts:
        return False
    current = projects_root
    for part in relative.parts:
        current = current / part
        if _is_link(current):
            return False
    if not current.exists():
        return False
    if len(relative.parts) == 1:
        shutil.rmtree(current)
    elif current.is_file():
        current.unlink()
    else:
        return False
    return True


def reconcile_orphans(
    settings: Settings, project_ids: set[int], image_keys: set[tuple[int, int, str]]
) -> int:
    """Remove files under data/projects/ that no database row refers to (D-19).

    Safety valve: with an empty `projects` table but numbered project folders
    on disk the database is far more likely wrong or restored than the files
    orphaned, so nothing is deleted. Returns the number of entries removed.
    """
    root = settings.projects_dir
    listing = scan_projects_root(root)
    numbered = [name for name in listing if _project_id_of(name) is not None]
    if not project_ids and numbered:
        logger.error(
            "Skipping orphan cleanup: the projects table is empty but %d project folder(s) "
            "exist under %s. The database may be wrong or restored; no files were deleted.",
            len(numbered),
            root,
        )
        return 0
    removed = 0
    for relative in find_orphans(listing, project_ids, image_keys):
        try:
            if _remove_orphan(root, relative):
                removed += 1
        except OSError:
            logger.warning("Could not remove orphan %s", root / relative, exc_info=True)
    logger.info("Orphan cleanup removed %d entries under %s", removed, root)
    return removed
