"""Annotation persistence: whole-set replace guarded by a compare-and-swap version.

The save contract (D-12) is the surface later phases build on (polygons, AI
accept/reject): one PUT replaces an image's complete box set, and the very first
statement of the transaction is

    UPDATE images SET annotation_version = annotation_version + 1
    WHERE id = :image AND project_id = :project AND annotation_version = :base

so the SQLite write lock is taken before anything is read, and a stale `base`
(`rowcount != 1`) is detected atomically. Every failure path rolls back, which
leaves the version and the rows exactly as they were.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.models import Annotation, Image, ProjectClass, utcnow
from yolo_trainer_api.schemas import (
    AnnotationSave,
    AnnotationSetRead,
    BoxRead,
    SaveResult,
    derive_status,
)

CONFLICT_DETAIL = "These annotations were changed elsewhere. Reload the image to continue."
UNKNOWN_CLASS_DETAIL = "Unknown class."
FOREIGN_BOX_DETAIL = "A box id is already used by another image."
IMAGE_NOT_FOUND_DETAIL = "Image not found."

# Coordinates are compared after rounding so a JSON round trip cannot create a
# false difference (the client rounds to 6 decimals as well).
_PRECISION = 6


async def load_annotation_set(session: AsyncSession, image: Image) -> AnnotationSetRead:
    """The stored box set of `image`, ordered by `position` then `id`."""
    rows = await session.execute(
        select(Annotation)
        .where(Annotation.image_id == image.id)
        .order_by(Annotation.position, Annotation.id)
    )
    boxes = [BoxRead.model_validate(row) for row in rows.scalars()]
    return AnnotationSetRead(
        version=image.annotation_version,
        is_background=image.is_background,
        is_reviewed=image.is_reviewed,
        status=derive_status(len(boxes), image.is_background, image.is_reviewed),
        boxes=boxes,
    )


def same_content(stored: AnnotationSetRead, payload: AnnotationSave) -> bool:
    """True when the payload describes exactly the stored set (flags, order, boxes)."""
    if stored.is_background != payload.is_background or stored.is_reviewed != payload.is_reviewed:
        return False
    if len(stored.boxes) != len(payload.boxes):
        return False
    for have, want in zip(stored.boxes, payload.boxes, strict=True):
        if have.id != want.id or have.class_id != want.class_id:
            return False
        if (
            round(have.x, _PRECISION) != round(want.x, _PRECISION)
            or round(have.y, _PRECISION) != round(want.y, _PRECISION)
            or round(have.w, _PRECISION) != round(want.w, _PRECISION)
            or round(have.h, _PRECISION) != round(want.h, _PRECISION)
        ):
            return False
    return True


async def _conflict(
    session: AsyncSession, project_id: int, image_id: int, payload: AnnotationSave
) -> SaveResult:
    """Handle a failed compare-and-swap: idempotent retry (200) or conflict (409)."""
    await session.rollback()
    image = (
        await session.execute(
            select(Image).where(Image.id == image_id, Image.project_id == project_id)
        )
    ).scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail=IMAGE_NOT_FOUND_DETAIL)
    stored = await load_annotation_set(session, image)
    if same_content(stored, payload):
        # A retry whose first attempt succeeded but whose response was lost must
        # not be reported as a conflict.
        return SaveResult(
            version=stored.version,
            box_count=len(stored.boxes),
            status=stored.status,
            is_background=stored.is_background,
            is_reviewed=stored.is_reviewed,
        )
    raise HTTPException(status_code=409, detail=CONFLICT_DETAIL)


async def apply_save(
    session: AsyncSession, project_id: int, image_id: int, payload: AnnotationSave
) -> SaveResult:
    """Replace the image's whole box set if `payload.base_version` is current."""
    # (1) Compare-and-swap, FIRST statement: takes the write lock before any read.
    swapped = await session.execute(
        update(Image)
        .where(
            Image.id == image_id,
            Image.project_id == project_id,
            Image.annotation_version == payload.base_version,
        )
        .values(annotation_version=Image.annotation_version + 1)
        .execution_options(synchronize_session=False)
    )
    if swapped.rowcount != 1:  # type: ignore[attr-defined]
        return await _conflict(session, project_id, image_id, payload)

    # (2) Every class must belong to THIS project (an FK alone accepts a class
    # of another project).
    class_ids = {box.class_id for box in payload.boxes}
    if class_ids:
        known = set(
            (
                await session.execute(
                    select(ProjectClass.id).where(
                        ProjectClass.project_id == project_id, ProjectClass.id.in_(class_ids)
                    )
                )
            ).scalars()
        )
        if known != class_ids:
            await session.rollback()
            raise HTTPException(status_code=422, detail=UNKNOWN_CLASS_DETAIL)

    # (3) A payload id already used under another image is refused.
    payload_ids = [box.id for box in payload.boxes]
    if payload_ids:
        foreign = (
            await session.execute(
                select(Annotation.id)
                .where(Annotation.id.in_(payload_ids), Annotation.image_id != image_id)
                .limit(1)
            )
        ).first()
        if foreign is not None:
            await session.rollback()
            raise HTTPException(status_code=422, detail=FOREIGN_BOX_DETAIL)

    # (4) Diff-apply: delete what is gone, update what exists, insert the rest.
    existing = {
        row.id: row
        for row in (
            await session.execute(select(Annotation).where(Annotation.image_id == image_id))
        ).scalars()
    }
    stale_ids = [box_id for box_id in existing if box_id not in set(payload_ids)]
    if stale_ids:
        await session.execute(
            delete(Annotation)
            .where(Annotation.id.in_(stale_ids))
            .execution_options(synchronize_session=False)
        )
    now = utcnow()
    for position, box in enumerate(payload.boxes):
        row = existing.get(box.id)
        if row is None:
            session.add(
                Annotation(
                    id=box.id,
                    image_id=image_id,
                    class_id=box.class_id,
                    kind="box",
                    x=box.x,
                    y=box.y,
                    w=box.w,
                    h=box.h,
                    position=position,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            row.class_id = box.class_id
            row.x, row.y, row.w, row.h = box.x, box.y, box.w, box.h
            row.position = position

    # (5) The server enforces structure only; the demotion intent of D-15 lives
    # in the client store (a payload may carry an edit and a later explicit
    # "reviewed" inside one debounce window).
    await session.execute(
        update(Image)
        .where(Image.id == image_id)
        .values(is_background=payload.is_background, is_reviewed=payload.is_reviewed)
        .execution_options(synchronize_session=False)
    )

    # (6) Commit; a class deleted mid-save surfaces as an FK violation here.
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=422, detail=UNKNOWN_CLASS_DETAIL) from None

    return SaveResult(
        version=payload.base_version + 1,
        box_count=len(payload.boxes),
        status=derive_status(len(payload.boxes), payload.is_background, payload.is_reviewed),
        is_background=payload.is_background,
        is_reviewed=payload.is_reviewed,
    )
