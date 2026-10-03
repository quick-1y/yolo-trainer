"""GET /api/config - the upload limits the browser pre-filters against (D-04)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from yolo_trainer_api.image_processing import ACCEPTED_EXTENSIONS
from yolo_trainer_api.schemas import ConfigRead

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config", response_model=ConfigRead)
async def read_config(request: Request) -> ConfigRead:
    settings = request.app.state.settings
    return ConfigRead(
        max_upload_mb=settings.max_upload_mb,
        max_upload_bytes=settings.max_upload_bytes,
        accepted_extensions=list(ACCEPTED_EXTENSIONS),
    )
