"""POST/GET /api/projects/{project_id}/images and the thumbnail route."""

from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api import storage
from yolo_trainer_api.db import get_session
from yolo_trainer_api.image_processing import Rejected, clean_filename, process_image
from yolo_trainer_api.models import Image, normalize_project_name
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import ImagePage, ImageRead, UploadResponse, UploadResult
from yolo_trainer_api.security import require_xhr
from yolo_trainer_api.settings import Settings

router = APIRouter(prefix="/api/projects", tags=["images"])

DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 500
SORT_NEWEST = "newest"
_THUMBNAIL_CACHE_CONTROL = "private, max-age=31536000, immutable"


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
    return Cursor(sort=sort, key=key, image_id=image_id)


def build_page_query(project_id: int, cursor: Cursor | None, limit: int) -> Select[tuple[Image]]:
    """Newest-first keyset page: `limit + 1` rows so the caller can tell if more exist."""
    stmt = select(Image).where(Image.project_id == project_id)
    if cursor is not None:
        stmt = stmt.where(Image.id < cursor.image_id)
    return stmt.order_by(Image.id.desc()).limit(limit + 1)


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
# List and thumbnail
# --------------------------------------------------------------------------


@router.get("/{project_id}/images", response_model=ImagePage)
async def list_images(
    project_id: int,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    session: AsyncSession = Depends(get_session),
) -> ImagePage:
    decoded = _decode_cursor(cursor, SORT_NEWEST) if cursor else None
    await get_project_or_404(session, project_id)

    rows = list((await session.execute(build_page_query(project_id, decoded, limit))).scalars())
    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = _encode_cursor(SORT_NEWEST, None, rows[-1].id)

    total = (
        await session.execute(select(func.count(Image.id)).where(Image.project_id == project_id))
    ).scalar_one()
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
        path, media_type="image/webp", headers={"Cache-Control": _THUMBNAIL_CACHE_CONTROL}
    )
