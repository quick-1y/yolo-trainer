"""GET image detail, GET/PUT the annotation set of one image.

FastAPI matches routes in declaration order, so literal paths under
`/{project_id}/images/` (the next-unannotated and status-counts routes added by a
later plan) must be declared ABOVE `GET /{project_id}/images/{image_id}`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.annotations import (
    IMAGE_NOT_FOUND_DETAIL,
    apply_save,
    load_annotation_set,
)
from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Image
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import AnnotationSave, AnnotationSetRead, ImageRead, SaveResult
from yolo_trainer_api.security import require_xhr

router = APIRouter(prefix="/api/projects", tags=["annotations"])


async def get_image_or_404(session: AsyncSession, project_id: int, image_id: int) -> Image:
    """Fetch an image by id within its project or raise a plain-English 404."""
    result = await session.execute(
        select(Image).where(Image.id == image_id, Image.project_id == project_id)
    )
    image = result.scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail=IMAGE_NOT_FOUND_DETAIL)
    return image


@router.get("/{project_id}/images/{image_id}", response_model=ImageRead)
async def get_image(
    project_id: int, image_id: int, session: AsyncSession = Depends(get_session)
) -> Image:
    await get_project_or_404(session, project_id)
    return await get_image_or_404(session, project_id, image_id)


@router.get("/{project_id}/images/{image_id}/annotations", response_model=AnnotationSetRead)
async def get_annotations(
    project_id: int, image_id: int, session: AsyncSession = Depends(get_session)
) -> AnnotationSetRead:
    await get_project_or_404(session, project_id)
    image = await get_image_or_404(session, project_id, image_id)
    return await load_annotation_set(session, image)


@router.put(
    "/{project_id}/images/{image_id}/annotations",
    response_model=SaveResult,
    dependencies=[Depends(require_xhr)],
)
async def save_annotations(
    project_id: int,
    image_id: int,
    payload: AnnotationSave,
    session: AsyncSession = Depends(get_session),
) -> SaveResult:
    # The JSON body already forces a CORS preflight; `require_xhr` is defense in depth.
    await get_project_or_404(session, project_id)
    return await apply_save(session, project_id, image_id, payload)
