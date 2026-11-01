"""Split routes of a project: manual assignment and the confirmed auto-split (DATA-05).

- `POST /api/projects/{project_id}/images/split` assigns the listed images by hand.
- The preview route (`.../splits/auto` + `/preview`) shows what an automatic split of the
  images without a split would give, and writes nothing.
- `POST /api/projects/{project_id}/splits/auto` applies exactly that split, or answers 409.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Image
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import (
    AutoSplitApply,
    AutoSplitPreview,
    AutoSplitRatios,
    AutoSplitResult,
    DatasetCounts,
    SplitRequest,
    SplitResult,
)
from yolo_trainer_api.security import require_xhr
from yolo_trainer_api.splits import SPLITS, auto_split, split_counts

router = APIRouter(prefix="/api/projects", tags=["splits"])

AUTO_SPLIT_DRIFT_DETAIL = "The set of unassigned images changed. Review the split again."
# Ids per UPDATE ... IN (...) statement: well inside SQLite's bound-variable limit (T4-06-03).
_WRITE_CHUNK = 500


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


async def _unassigned_ids(session: AsyncSession, project_id: int) -> list[int]:
    """Every image of this project without a split, annotated or not (D-03)."""
    rows = await session.execute(
        select(Image.id)
        .where(Image.project_id == project_id, Image.split.is_(None))
        .order_by(Image.id)
    )
    return list(rows.scalars())


@router.post(
    "/{project_id}/splits/auto/preview",
    response_model=AutoSplitPreview,
    dependencies=[Depends(require_xhr)],
)
async def preview_auto_split(
    project_id: int, body: AutoSplitRatios, session: AsyncSession = Depends(get_session)
) -> AutoSplitPreview:
    """What an automatic split of the unassigned images would give; changes nothing."""
    await get_project_or_404(session, project_id)
    ids = await _unassigned_ids(session, project_id)
    seed = body.seed if body.seed is not None else secrets.randbelow(2**31)
    assignment = auto_split(ids, body.train, body.valid, body.test, seed)
    return AutoSplitPreview(
        seed=seed,
        unassigned_total=len(ids),
        counts=DatasetCounts(**split_counts(assignment)),
    )


@router.post(
    "/{project_id}/splits/auto",
    response_model=AutoSplitResult,
    dependencies=[Depends(require_xhr)],
)
async def apply_auto_split(
    project_id: int, body: AutoSplitApply, session: AsyncSession = Depends(get_session)
) -> AutoSplitResult:
    """Apply the previewed split to the images that still have no split (D-03).

    The same seed over the same number of unassigned images gives the previewed counts
    (the counts depend only on that number). If the number differs, or any image got a
    split between the read and the write, nothing is written and the answer is 409:
    every UPDATE is guarded by `split IS NULL` and the written rows must add up to the
    ids that were read. Only the `split` column is written.
    """
    await get_project_or_404(session, project_id)
    ids = await _unassigned_ids(session, project_id)
    if len(ids) != body.expected_unassigned:
        raise HTTPException(status_code=409, detail=AUTO_SPLIT_DRIFT_DETAIL)

    assignment = auto_split(ids, body.train, body.valid, body.test, body.seed)
    written = 0
    for split in SPLITS:
        chosen = [image_id for image_id, value in assignment.items() if value == split]
        for start in range(0, len(chosen), _WRITE_CHUNK):
            result = await session.execute(
                update(Image)
                .where(
                    Image.project_id == project_id,
                    Image.id.in_(chosen[start : start + _WRITE_CHUNK]),
                    Image.split.is_(None),
                )
                .values(split=split)
                .execution_options(synchronize_session=False)
            )
            written += result.rowcount
    if written != len(ids):
        await session.rollback()
        raise HTTPException(status_code=409, detail=AUTO_SPLIT_DRIFT_DETAIL)
    await session.commit()
    return AutoSplitResult(counts=DatasetCounts(**split_counts(assignment)))
