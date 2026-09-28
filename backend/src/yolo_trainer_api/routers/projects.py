"""GET/POST /api/projects."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Project
from yolo_trainer_api.schemas import ProjectCreate, ProjectRead

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
async def list_projects(session: AsyncSession = Depends(get_session)) -> list[Project]:
    stmt = select(Project).order_by(Project.updated_at.desc(), Project.id.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_project_or_404(session: AsyncSession, project_id: int) -> Project:
    """Fetch a project by primary key or raise a plain-English 404 (D-05).

    Shared by the read route here and by Plan 09's PATCH/DELETE routes so
    every project-scoped endpoint reports the same "not found" wording.
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
