"""GET/POST /api/projects/{project_id}/classes and PATCH /classes/{class_id}.

Classes carry a stored, contiguous `position` (the YOLO index, 0..N-1 in
creation order). The index is never client-supplied and there is no reorder
operation (D-13, D-14): annotations reference a class by `id`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import ProjectClass
from yolo_trainer_api.palette import next_color
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import ClassCreate, ClassRead, ClassUpdate

router = APIRouter(prefix="/api/projects", tags=["classes"])


async def get_class_or_404(session: AsyncSession, project_id: int, class_id: int) -> ProjectClass:
    """Fetch a class by id within its project or raise a plain-English 404.

    Selecting by id AND project_id keeps a class id from another project from
    ever resolving through this project's URL.
    """
    result = await session.execute(
        select(ProjectClass).where(
            ProjectClass.id == class_id, ProjectClass.project_id == project_id
        )
    )
    project_class = result.scalar_one_or_none()
    if project_class is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    return project_class


@router.get("/{project_id}/classes", response_model=list[ClassRead])
async def list_classes(
    project_id: int, session: AsyncSession = Depends(get_session)
) -> list[ProjectClass]:
    await get_project_or_404(session, project_id)
    result = await session.execute(
        select(ProjectClass)
        .where(ProjectClass.project_id == project_id)
        .order_by(ProjectClass.position, ProjectClass.id)
    )
    return list(result.scalars().all())


@router.post("/{project_id}/classes", response_model=ClassRead, status_code=201)
async def create_class(
    project_id: int, payload: ClassCreate, session: AsyncSession = Depends(get_session)
) -> ProjectClass:
    await get_project_or_404(session, project_id)

    color = payload.color
    if color is None:
        used = await session.execute(
            select(ProjectClass.color).where(ProjectClass.project_id == project_id)
        )
        used_colors = list(used.scalars().all())
        color = next_color(used_colors, len(used_colors))

    project_class = ProjectClass(project_id=project_id, color=color)
    project_class.set_name(payload.name)
    attempted_normalized_name = project_class.normalized_name
    # The position is computed inside the INSERT itself (never count-then-insert),
    # so concurrent creates cannot be handed the same index.
    project_class.position = (
        select(func.coalesce(func.max(ProjectClass.position), -1) + 1)
        .where(ProjectClass.project_id == project_id)
        .scalar_subquery()
    )
    session.add(project_class)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        # Use the ALREADY-STORED class's display name in the message: the
        # rejected attempt may differ only by case/whitespace/Unicode form.
        existing = await session.execute(
            select(ProjectClass.name).where(
                ProjectClass.project_id == project_id,
                ProjectClass.normalized_name == attempted_normalized_name,
            )
        )
        existing_name = existing.scalar_one_or_none()
        if existing_name is None:
            # Not a name collision: the project was deleted while we were inserting.
            await get_project_or_404(session, project_id)
            existing_name = payload.name
        raise HTTPException(
            status_code=409,
            detail=f'A class named "{existing_name}" already exists.',
        ) from None
    await session.refresh(project_class)
    return project_class


@router.patch("/{project_id}/classes/{class_id}", response_model=ClassRead)
async def update_class(
    project_id: int,
    class_id: int,
    payload: ClassUpdate,
    session: AsyncSession = Depends(get_session),
) -> ProjectClass:
    await get_project_or_404(session, project_id)
    project_class = await get_class_or_404(session, project_id, class_id)
    fields = payload.model_fields_set

    attempted_normalized_name: str | None = None
    if "name" in fields:
        project_class.set_name(payload.name)  # type: ignore[arg-type]
        attempted_normalized_name = project_class.normalized_name
    if "color" in fields:
        project_class.color = payload.color  # type: ignore[assignment]

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        # Capture the attempted normalized name BEFORE rollback (above): the
        # class is a persistent row, so rollback reloads the PRE-update values.
        # The message names the ALREADY-STORED class, which may differ from the
        # attempt by case/whitespace/Unicode form.
        existing = await session.execute(
            select(ProjectClass.name).where(
                ProjectClass.project_id == project_id,
                ProjectClass.normalized_name == attempted_normalized_name,
            )
        )
        existing_name = existing.scalar_one_or_none()
        if existing_name is None:
            # Not a name collision: the class or project vanished mid-update.
            await get_project_or_404(session, project_id)
            await get_class_or_404(session, project_id, class_id)
            existing_name = payload.name
        raise HTTPException(
            status_code=409,
            detail=f'A class named "{existing_name}" already exists.',
        ) from None
    await session.refresh(project_class)
    return project_class
