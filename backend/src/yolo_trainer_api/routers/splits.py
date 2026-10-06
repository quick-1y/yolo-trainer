"""POST /api/projects/{project_id}/images/split - assign images to train/valid/test (DATA-05)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Image
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import SplitRequest, SplitResult
from yolo_trainer_api.security import require_xhr

router = APIRouter(prefix="/api/projects", tags=["splits"])


@router.post(
    "/{project_id}/images/split",
    response_model=SplitResult,
    dependencies=[Depends(require_xhr)],
)
async def set_split(
    project_id: int, body: SplitRequest, session: AsyncSession = Depends(get_session)
) -> SplitResult:
    """Set the split of exactly the listed images of this project (`null` = unassigned).

    Only `split` is written: changing a split is not an annotation change, so it never
    bumps `annotation_version` or touches `is_reviewed` / `is_background` (D-02). Ids of
    other projects match no row.
    """
    await get_project_or_404(session, project_id)
    ids = list(dict.fromkeys(body.ids))
    result = await session.execute(
        update(Image)
        .where(Image.project_id == project_id, Image.id.in_(ids))
        .values(split=body.split)
        .execution_options(synchronize_session=False)
    )
    await session.commit()
    return SplitResult(updated=result.rowcount)
