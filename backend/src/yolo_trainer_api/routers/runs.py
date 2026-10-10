"""Training runs: start one, list a project's runs, read one (TRAN-01, TRAN-04).

The router has the `/api` prefix and absolute sub-paths; `/training/active` (D-14) lives here too.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Project, TrainingRun
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import ActiveRun, RunCreate, RunRead, RunSummary, TrainingOptions
from yolo_trainer_api.security import require_xhr
from yolo_trainer_api.training import service
from yolo_trainer_api.training.options import build_options, ensure_device_available

router = APIRouter(prefix="/api", tags=["training"])


@router.post(
    "/projects/{project_id}/runs",
    response_model=RunRead,
    status_code=201,
    dependencies=[Depends(require_xhr)],
)
async def start_run(
    project_id: int,
    payload: RunCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> RunRead:
    project = await get_project_or_404(session, project_id)
    ensure_device_available(request.app.state.settings, payload.device)
    run, snapshot = await service.create_run(session, project, payload, request.app.state.settings)
    # Hard links and label files cost milliseconds per image on a bind mount, so the
    # dataset is built after the response; the run is `preparing` until then (Pitfall 4).
    background_tasks.add_task(
        service.prepare_run_files,
        request.app.state.sessionmaker,
        request.app.state.settings,
        snapshot,
    )
    await session.refresh(run)
    return await service.run_read(session, run)


@router.get("/training/active", response_model=ActiveRun | None)
async def get_active_run(session: AsyncSession = Depends(get_session)) -> ActiveRun | None:
    """The run in status `running`, or null; at most one exists (D-11)."""
    row = (
        await session.execute(
            select(TrainingRun, Project.name)
            .join(Project, Project.id == TrainingRun.project_id)
            .where(TrainingRun.status == "running")
            .order_by(TrainingRun.id)
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    run, project_name = row
    return ActiveRun(
        run_id=run.id,
        project_id=run.project_id,
        project_name=project_name,
        run_name=run.name,
        epoch=run.epoch,
        epochs=run.epochs,
        started_at=run.started_at,
    )


@router.get("/projects/{project_id}/training/options", response_model=TrainingOptions)
async def get_training_options(
    project_id: int, request: Request, session: AsyncSession = Depends(get_session)
) -> TrainingOptions:
    project = await get_project_or_404(session, project_id)
    return await build_options(session, request.app.state.settings, project)


@router.get("/projects/{project_id}/runs", response_model=list[RunSummary])
async def list_runs(
    project_id: int, session: AsyncSession = Depends(get_session)
) -> list[RunSummary]:
    await get_project_or_404(session, project_id)
    return await service.run_summaries(session, project_id)


@router.delete(
    "/projects/{project_id}/runs/{run_id}",
    status_code=204,
    dependencies=[Depends(require_xhr)],
)
async def remove_run(
    project_id: int,
    run_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    await get_project_or_404(session, project_id)
    await service.remove_queued_run(session, request.app.state.settings, project_id, run_id)
    return Response(status_code=204)


@router.get("/projects/{project_id}/runs/{run_id}", response_model=RunRead)
async def get_run(
    project_id: int, run_id: int, session: AsyncSession = Depends(get_session)
) -> RunRead:
    await get_project_or_404(session, project_id)
    run = (
        await session.execute(
            select(TrainingRun).where(
                TrainingRun.id == run_id, TrainingRun.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail=service.RUN_NOT_FOUND_DETAIL)
    return await service.run_read(session, run)
