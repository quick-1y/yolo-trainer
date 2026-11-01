"""GET /api/models/{model_id}/download - the `.pt` of a registered model (MODL-04)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.db import get_session
from yolo_trainer_api.models import Project, TrainedModel
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training.service import model_download_name
from yolo_trainer_common import layout

router = APIRouter(prefix="/api/models", tags=["models"])

MODEL_NOT_FOUND_DETAIL = "Model not found."


@router.get("/{model_id}/download")
async def download_model(
    model_id: int, request: Request, session: AsyncSession = Depends(get_session)
) -> FileResponse:
    model = await session.get(TrainedModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail=MODEL_NOT_FOUND_DETAIL)
    settings: Settings = request.app.state.settings
    # The path is derived from the integer id, never from any request input (T4-03).
    path = layout.model_file(settings.data_dir, model.id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=MODEL_NOT_FOUND_DETAIL)
    project_name = None
    if model.project_id is not None:
        project_name = (
            await session.execute(select(Project.name).where(Project.id == model.project_id))
        ).scalar_one_or_none()
    return FileResponse(
        path,
        filename=model_download_name(project_name, model.name),
        media_type="application/octet-stream",
    )
