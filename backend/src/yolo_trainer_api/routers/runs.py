"""Training runs: start one, list a project's runs, read one (TRAN-01, TRAN-04).

The router has the `/api` prefix and absolute sub-paths; `/training/active` (D-14) lives here too.
"""

from __future__ import annotations

import asyncio
import functools
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.sse import EventSourceResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Project, TrainingRun
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.schemas import ActiveRun, RunCreate, RunRead, RunSummary, TrainingOptions
from yolo_trainer_api.security import require_xhr
from yolo_trainer_api.training import service
from yolo_trainer_api.training.options import build_options, ensure_device_available
from yolo_trainer_api.training.stream import (
    StreamTarget,
    parse_last_event_id,
    progress_frames,
    read_run_status,
    stream_target,
)

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
    return await service.run_read(session, run, request.app.state.settings.data_dir)


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
    """Delete a run: a never-resumed queued run leaves the queue, a finished one is hard-deleted.

    A finished run goes with its folder and its registered model (D-15); active runs and runs
    whose model is the base of an active run answer 409.
    """
    await get_project_or_404(session, project_id)
    await service.delete_run(session, request.app.state.settings, project_id, run_id)
    return Response(status_code=204)


@router.post(
    "/projects/{project_id}/runs/{run_id}/cancel",
    response_model=RunRead,
    dependencies=[Depends(require_xhr)],
)
async def cancel_run(
    project_id: int,
    run_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RunRead:
    """Ask for a running run to be cancelled. Only sets the flag the worker reads (D-07).

    A queued run that was resumed is taken back to `cancelled` here instead ("Cancel resume").
    """
    await get_project_or_404(session, project_id)
    run = await service.cancel_run(session, project_id, run_id)
    return await service.run_read(session, run, request.app.state.settings.data_dir)


@router.post(
    "/projects/{project_id}/runs/{run_id}/resume",
    response_model=RunRead,
    dependencies=[Depends(require_xhr)],
)
async def resume_run(
    project_id: int,
    run_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RunRead:
    """Queue an interrupted, cancelled or failed run again; it continues from its checkpoint."""
    await get_project_or_404(session, project_id)
    settings = request.app.state.settings
    run = await service.resume_run(session, settings, project_id, run_id)
    return await service.run_read(session, run, settings.data_dir)


@router.get("/projects/{project_id}/runs/{run_id}", response_model=RunRead)
async def get_run(
    project_id: int,
    run_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
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
    return await service.run_read(session, run, request.app.state.settings.data_dir)


@router.get("/projects/{project_id}/runs/{run_id}/interim-best")
async def download_interim_best(
    project_id: int,
    run_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """The best.pt of a failed, interrupted or cancelled run, as a download only (D-08).

    It is incomplete by nature (the training stopped early) and is never registered as a model,
    so it is not in the model list or the base-model picker. The path comes from the integer run
    id; the run is looked up by (id, project_id), so another project's run answers 404.
    """
    project = await get_project_or_404(session, project_id)
    run = (
        await session.execute(
            select(TrainingRun).where(
                TrainingRun.id == run_id, TrainingRun.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail=service.RUN_NOT_FOUND_DETAIL)
    path = await asyncio.to_thread(
        service.interim_best_file, request.app.state.settings.data_dir, run
    )
    if path is None:
        raise HTTPException(status_code=404, detail=service.INTERIM_NOT_FOUND_DETAIL)
    return FileResponse(
        path,
        filename=service.model_download_name(project.name, f"{run.name}_interim"),
        media_type="application/octet-stream",
    )


@router.get("/projects/{project_id}/runs/{run_id}/stream", response_class=EventSourceResponse)
async def stream_run(
    request: Request,
    last_event_id: Annotated[str | None, Header()] = None,
    target: StreamTarget = Depends(stream_target),
):
    """Progress of a run as Server-Sent Events: the replay of `progress.jsonl`, then live lines.

    A reconnecting browser sends the id of the last frame it saw (a byte offset) as
    `Last-Event-ID`; the stream resumes there, or replays from the start when the header is
    not a valid offset. No request-scoped database session here: FastAPI would keep it open for
    the whole stream (see `training.stream`).
    """
    size = await asyncio.to_thread(_file_size, target.progress_path)
    status_reader = functools.partial(
        read_run_status, request.app.state.sessionmaker, target.run_id
    )
    async for frame in progress_frames(
        target.progress_path,
        parse_last_event_id(last_event_id, size),
        target.task_type,
        status_reader,
    ):
        yield frame


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0
