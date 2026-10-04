"""POST/GET /api/projects/{project_id}/images, the thumbnail and the original-file routes."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import ColumnElement, Select, delete, func, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api import storage
from yolo_trainer_api.db import get_session
from yolo_trainer_api.image_processing import EXT_MEDIA, Rejected, clean_filename, process_image
from yolo_trainer_api.models import Image, normalize_project_name
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import (
    ImageDeleteRequest,
    ImageDeleteResult,
    ImagePage,
    ImageRead,
    UploadResponse,
    UploadResult,
)
from yolo_trainer_api.security import require_xhr
from yolo_trainer_api.settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["images"])

DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 500
SORT_NEWEST = "newest"
SORT_NAME = "name"
MAX_SEARCH_LENGTH = 255
_IMMUTABLE_CACHE_CONTROL = "private, max-age=31536000, immutable"


def _settings(request: Request) -> Settings:
    return request.app.state.settings


# --------------------------------------------------------------------------
# Cursors
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Cursor:
    sort: str
    key: str | None
    image_id: int


def _encode_cursor(sort: str, key: str | None, image_id: int) -> str:
    """Unpadded URL-safe base64 of compact JSON `{"s", "k", "i"}`."""
    raw = json.dumps({"s": sort, "k": key, "i": image_id}, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _invalid_cursor() -> HTTPException:
    return HTTPException(status_code=422, detail="Invalid cursor.")


def _decode_cursor(raw: str, expected_sort: str) -> Cursor:
    try:
        padded = raw + "=" * (-len(raw) % 4)
        data = json.loads(base64.b64decode(padded.encode("ascii"), altchars=b"-_", validate=True))
    except (ValueError, UnicodeError):
        raise _invalid_cursor() from None
    if not isinstance(data, dict):
        raise _invalid_cursor()
    sort, key, image_id = data.get("s"), data.get("k"), data.get("i")
    if sort != expected_sort or not isinstance(sort, str):
        raise _invalid_cursor()
    if isinstance(image_id, bool) or not isinstance(image_id, int) or image_id < 1:
        raise _invalid_cursor()
    if key is not None and not isinstance(key, str):
        raise _invalid_cursor()
    if sort == SORT_NAME and key is None:
        raise _invalid_cursor()
    return Cursor(sort=sort, key=key, image_id=image_id)


def _scoped[T: tuple](stmt: Select[T], project_id: int, q_key: str) -> Select[T]:
    """Every listing query is scoped to one project; `q_key` is a normalized filename fragment."""
    stmt = stmt.where(Image.project_id == project_id)
    if q_key:
        # autoescape makes a literal % or _ in the search text match itself.
        stmt = stmt.where(Image.filename_key.contains(q_key, autoescape=True))
    return stmt


def grid_after(sort: str, key: str | None, image_id: int) -> ColumnElement[bool]:
    """Where-clause for rows strictly AFTER the pivot `(key, image_id)` in grid order.

    newest: `id < i` (the grid runs newest first). name: row value
    `(filename_key, id) > (k, i)`; the id tiebreak keeps equal filenames stable.
    """
    if sort == SORT_NAME:
        return tuple_(Image.filename_key, Image.id) > tuple_(key, image_id)
    return Image.id < image_id


def grid_before(sort: str, key: str | None, image_id: int) -> ColumnElement[bool]:
    """Where-clause for rows strictly BEFORE the pivot; the mirror of `grid_after`."""
    if sort == SORT_NAME:
        return tuple_(Image.filename_key, Image.id) < tuple_(key, image_id)
    return Image.id > image_id


def grid_order(sort: str, reverse: bool = False) -> tuple[ColumnElement[Any], ...]:
    """ORDER BY terms of the grid; `reverse=True` walks it backwards (nearest-before lookups)."""
    if sort == SORT_NAME:
        if reverse:
            return (Image.filename_key.desc(), Image.id.desc())
        return (Image.filename_key, Image.id)
    return (Image.id.asc(),) if reverse else (Image.id.desc(),)


def build_page_query(
    project_id: int, sort: str, q_key: str, cursor: Cursor | None, limit: int
) -> Select[tuple[Image]]:
    """Keyset page: `limit + 1` rows so the caller can tell if more exist.

    newest: `ORDER BY id DESC`, cursor `id < i` (ix_images_project_id_id).
    name: `ORDER BY filename_key, id`, row-value cursor `(filename_key, id) > (k, i)`
    (ix_images_project_filename_key); the id tiebreak keeps equal filenames stable.
    """
    stmt = _scoped(select(Image), project_id, q_key)
    if cursor is not None:
        stmt = stmt.where(grid_after(sort, cursor.key, cursor.image_id))
    return stmt.order_by(*grid_order(sort)).limit(limit + 1)


# --------------------------------------------------------------------------
# Upload
# --------------------------------------------------------------------------


def _rejected(name: str, reason: str) -> UploadResult:
    return UploadResult(filename=name, status="rejected", reason=reason)


async def _find_duplicate(session: AsyncSession, project_id: int, sha256: str) -> bool:
    result = await session.execute(
        select(Image.id).where(Image.project_id == project_id, Image.sha256 == sha256)
    )
    return result.first() is not None


def _duplicate(name: str) -> UploadResult:
    return UploadResult(
        filename=name, status="duplicate", reason="Already present in this project."
    )


async def ingest_one(
    session: AsyncSession, settings: Settings, project_id: int, upload: UploadFile
) -> UploadResult:
    """Stage -> hash -> dedup -> decode -> short transaction + rename for one file.

    The SQLite write lock is only held around INSERT + rename + COMMIT, never
    during the (slow) copy or decode. A crash leaves only `.incoming` leftovers
    or an id-named file without a row, both removable by a startup reconcile.
    """
    name = clean_filename(upload.filename or "")
    if upload.size == 0:
        return _rejected(name, "The file is empty.")
    if upload.size is not None and upload.size > settings.max_upload_bytes:
        return _rejected(name, f"The file is larger than {settings.max_upload_mb} MB.")

    try:
        staged, sha256, size_bytes = await asyncio.to_thread(
            storage.stage_and_hash, settings, project_id, upload.file
        )
    except Rejected as exc:
        return _rejected(name, exc.reason)

    consumed = False
    try:
        if size_bytes == 0:
            return _rejected(name, "The file is empty.")
        if await _find_duplicate(session, project_id, sha256):
            return _duplicate(name)
        try:
            processed = await asyncio.to_thread(
                process_image,
                staged,
                thumb_size=settings.thumbnail_size,
                max_pixels=settings.max_image_pixels,
            )
        except Rejected as exc:
            return _rejected(name, exc.reason)

        thumb_tmp = await asyncio.to_thread(
            storage.write_thumb_tmp, settings, project_id, processed.thumb
        )
        image = Image(
            project_id=project_id,
            original_filename=name,
            filename_key=normalize_project_name(name),
            ext=processed.ext,
            sha256=sha256,
            size_bytes=size_bytes,
            width=processed.width,
            height=processed.height,
        )
        session.add(image)
        try:
            await session.flush()  # allocates the AUTOINCREMENT id
        except IntegrityError:
            # Concurrent identical upload, or the project vanished mid-upload.
            await session.rollback()
            await asyncio.to_thread(storage.discard, thumb_tmp)
            if await _find_duplicate(session, project_id, sha256):
                return _duplicate(name)
            raise HTTPException(status_code=404, detail="Project not found.") from None

        image_id = image.id
        try:
            await asyncio.to_thread(
                storage.commit_files,
                settings,
                project_id,
                image_id,
                processed.ext,
                staged,
                thumb_tmp,
            )
            consumed = True
            await session.commit()
        except BaseException:
            await session.rollback()
            await asyncio.to_thread(
                storage.remove_image_files, settings, project_id, image_id, processed.ext
            )
            await asyncio.to_thread(storage.discard, thumb_tmp)
            raise
        # Loads the derived box_count; reading a column_property on a
        # just-inserted row would otherwise raise MissingGreenlet.
        await session.refresh(image)
        return UploadResult(filename=name, status="added", image=ImageRead.model_validate(image))
    finally:
        if not consumed:
            await asyncio.to_thread(storage.discard, staged)


@router.post(
    "/{project_id}/images",
    response_model=UploadResponse,
    dependencies=[Depends(require_xhr)],
)
async def upload_images(
    project_id: int,
    request: Request,
    files: Annotated[list[UploadFile], File()],
    session: AsyncSession = Depends(get_session),
) -> UploadResponse:
    await get_project_or_404(session, project_id)
    settings = _settings(request)
    results: list[UploadResult] = []
    for upload in files:
        results.append(await ingest_one(session, settings, project_id, upload))
    return UploadResponse(results=results)


# --------------------------------------------------------------------------
# List, thumbnail and original
# --------------------------------------------------------------------------


@router.get("/{project_id}/images", response_model=ImagePage)
async def list_images(
    project_id: int,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    sort: Literal["newest", "name"] = SORT_NEWEST,
    q: Annotated[str, Query(max_length=MAX_SEARCH_LENGTH)] = "",
    session: AsyncSession = Depends(get_session),
) -> ImagePage:
    decoded = _decode_cursor(cursor, sort) if cursor else None
    await get_project_or_404(session, project_id)
    q_key = normalize_project_name(q)

    page = build_page_query(project_id, sort, q_key, decoded, limit)
    rows = list((await session.execute(page)).scalars())
    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = _encode_cursor(
            sort, last.filename_key if sort == SORT_NAME else None, last.id
        )

    count_stmt = _scoped(select(func.count(Image.id)), project_id, q_key)
    total = (await session.execute(count_stmt)).scalar_one()
    return ImagePage(
        items=[ImageRead.model_validate(row) for row in rows],
        next_cursor=next_cursor,
        total=total,
    )


@router.get("/{project_id}/images/{image_id}/thumbnail")
async def get_thumbnail(
    project_id: int,
    image_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    found = (
        await session.execute(
            select(Image.id).where(Image.id == image_id, Image.project_id == project_id)
        )
    ).first()
    if found is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = storage.thumb_path(_settings(request), project_id, image_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(
        path, media_type="image/webp", headers={"Cache-Control": _IMMUTABLE_CACHE_CONTROL}
    )


@router.get("/{project_id}/images/{image_id}/file")
async def get_original(
    project_id: int,
    image_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """The stored original, byte for byte.

    The media type comes from the stored (CHECK-constrained) extension, never
    from the client's filename or content type.
    """
    ext = (
        await session.execute(
            select(Image.ext).where(Image.id == image_id, Image.project_id == project_id)
        )
    ).scalar_one_or_none()
    if ext is None or ext not in EXT_MEDIA:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = storage.image_path(_settings(request), project_id, image_id, ext)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(
        path, media_type=EXT_MEDIA[ext], headers={"Cache-Control": _IMMUTABLE_CACHE_CONTROL}
    )


# --------------------------------------------------------------------------
# Delete
# --------------------------------------------------------------------------


@router.post("/{project_id}/images/delete", response_model=ImageDeleteResult)
async def delete_images(
    project_id: int,
    body: ImageDeleteRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ImageDeleteResult:
    """Hard-delete images: rows first and committed, files after (D-19).

    Only rows of this project are touched (T2-11-01), so ids of other projects
    are ignored and a repeated request deletes nothing. A file that cannot be
    removed is logged and left for the startup cleanup; the rows are already gone.
    """
    await get_project_or_404(session, project_id)
    ids = list(dict.fromkeys(body.ids))
    scope = (Image.project_id == project_id, Image.id.in_(ids))
    removed = (await session.execute(select(Image.id, Image.ext).where(*scope))).all()
    if not removed:
        return ImageDeleteResult(deleted=0)
    await session.execute(delete(Image).where(*scope))
    await session.commit()

    settings = _settings(request)
    for image_id, ext in removed:
        try:
            await asyncio.to_thread(storage.remove_image_files, settings, project_id, image_id, ext)
        except Exception:
            logger.exception(
                "Could not remove files of deleted image %s in project %s", image_id, project_id
            )
    return ImageDeleteResult(deleted=len(removed))
