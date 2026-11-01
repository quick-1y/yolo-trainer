"""GET/POST/PATCH/DELETE /api/projects."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Project, TrainedModel, TrainingRun
from yolo_trainer_api.schemas import (
    ACTIVE_RUN_STATUSES,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
)
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.storage import remove_project_dir, remove_run_files

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])

PROJECT_HAS_ACTIVE_RUN_DETAIL = (
    "A training run is active or queued for this project. "
    "Wait for it to finish or remove it from the queue."
)


@router.get("", response_model=list[ProjectRead])
async def list_projects(session: AsyncSession = Depends(get_session)) -> list[Project]:
    stmt = select(Project).order_by(Project.updated_at.desc(), Project.id.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_project_or_404(session: AsyncSession, project_id: int) -> Project:
    """Fetch a project by primary key or raise a plain-English 404 (D-05).

    Shared by every project-scoped route so all of them report the same
    "not found" wording.
    """
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: int, session: AsyncSession = Depends(get_session)) -> Project:
    return await get_project_or_404(session, project_id)


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    payload: ProjectCreate, session: AsyncSession = Depends(get_session)
) -> Project:
    project = Project(task_type=payload.task_type, description=payload.description)
    project.set_name(payload.name)
    session.add(project)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        # Use the ALREADY-STORED project's display name in the message, not
        # the rejected attempt's - the attempt may differ only by case/
        # whitespace/Unicode-compatibility form (D-08).
        existing = await session.execute(
            select(Project.name).where(Project.normalized_name == project.normalized_name)
        )
        existing_name = existing.scalar_one_or_none() or project.name
        raise HTTPException(
            status_code=409,
            detail=f'A project named "{existing_name}" already exists.',
        ) from None
    await session.refresh(project)
    return project


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: int, payload: ProjectUpdate, session: AsyncSession = Depends(get_session)
) -> Project:
    project = await get_project_or_404(session, project_id)
    fields = payload.model_fields_set

    attempted_normalized_name: str | None = None
    if "name" in fields:
        project.set_name(payload.name)  # type: ignore[arg-type]
        attempted_normalized_name = project.normalized_name
    if "description" in fields:
        project.description = payload.description

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        # Same "use the already-stored name" rule as create (D-08). Capture
        # the attempted normalized name BEFORE rollback: `project` is a
        # persistent (already-existing) row here, so rollback expires it and
        # reloads the PRE-update values from the database, not the rejected
        # new ones.
        existing = await session.execute(
            select(Project.name).where(Project.normalized_name == attempted_normalized_name)
        )
        existing_name = existing.scalar_one_or_none() or payload.name
        raise HTTPException(
            status_code=409,
            detail=f'A project named "{existing_name}" already exists.',
        ) from None
    await session.refresh(project)
    return project


def _remove_project_files(
    settings: Settings, project_id: int, run_ids: list[int], model_ids: list[int]
) -> None:
    """Delete the folders and files of a project that is already gone from the database.

    Every failure is logged and skipped: the next startup cleanup removes leftovers.
    """
    try:
        remove_project_dir(settings, project_id)
    except Exception:
        logger.exception("Could not remove the folder of deleted project %s", project_id)
    remove_run_files(settings, run_ids, model_ids)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int, request: Request, session: AsyncSession = Depends(get_session)
) -> None:
    await get_project_or_404(session, project_id)
    # The ids are collected BEFORE the delete: the cascade takes the rows with it, and
    # the files are removed by id afterwards.
    run_ids = list(
        (await session.execute(select(TrainingRun.id).where(TrainingRun.project_id == project_id)))
        .scalars()
        .all()
    )
    model_ids = list(
        (
            await session.execute(
                select(TrainedModel.id).where(TrainedModel.project_id == project_id)
            )
        )
        .scalars()
        .all()
    )
    # D-21: ONE guarded statement closes the race with a run being queued or claimed
    # between the lookup and the delete - the check and the delete cannot be separated.
    active_run = exists().where(
        TrainingRun.project_id == project_id,
        TrainingRun.status.in_(ACTIVE_RUN_STATUSES),
    )
    result = await session.execute(
        delete(Project)
        .where(Project.id == project_id, ~active_run)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        await session.rollback()
        still_there = await session.execute(select(Project.id).where(Project.id == project_id))
        if still_there.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        raise HTTPException(status_code=409, detail=PROJECT_HAS_ACTIVE_RUN_DETAIL)
    # D-19: the database is the source of truth - rows first (FK cascade takes the images,
    # classes, annotations, runs and models rows with them and clears other projects' base
    # model references), then the files.
    await session.commit()
    await asyncio.to_thread(
        _remove_project_files, request.app.state.settings, project_id, run_ids, model_ids
    )
