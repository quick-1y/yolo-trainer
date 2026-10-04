"""GET/POST /api/projects/{project_id}/classes and PATCH/DELETE /classes/{class_id}.

Classes carry a stored, contiguous `position` (the YOLO index, 0..N-1 in
creation order). The index is never client-supplied and there is no reorder
operation (D-13, D-14): annotations reference a class by `id`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Annotation, Image, ProjectClass
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


@router.delete("/{project_id}/classes/{class_id}", status_code=204)
async def delete_class(
    project_id: int, class_id: int, session: AsyncSession = Depends(get_session)
) -> None:
    await get_project_or_404(session, project_id)
    project_class = await get_class_or_404(session, project_id, class_id)
    deleted_position = project_class.position

    # Annotations reference classes.id with ON DELETE CASCADE, so the class's
    # boxes disappear with the row below (P2 D-16). That silently changes every
    # image that held one, so in the SAME transaction (and before the cascade, while
    # the boxes can still be found) those images get a new annotation_version and
    # lose their reviewed flag (P3 D-12, D-15). Without the bump an editor tab that
    # still shows the deleted class would save its old box set with a current base
    # version and re-insert boxes of a class that no longer exists (Pitfall 5);
    # with it that save is a 409.
    await session.execute(
        update(Image)
        .where(Image.id.in_(select(Annotation.image_id).where(Annotation.class_id == class_id)))
        .values(annotation_version=Image.annotation_version + 1, is_reviewed=False)
        .execution_options(synchronize_session=False)
    )
    await session.delete(project_class)
    # Same transaction: close the gap so indices stay exactly 0..N-1 (D-13).
    # `position` has no unique constraint, so statement order cannot fail;
    # nothing references the index.
    await session.execute(
        update(ProjectClass)
        .where(
            ProjectClass.project_id == project_id,
            ProjectClass.position > deleted_position,
        )
        .values(position=ProjectClass.position - 1)
        .execution_options(synchronize_session=False)
    )
    await session.commit()
