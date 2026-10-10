"""What the "New training" form offers: official bases, defaults and the devices (D-07, D-09).

The defaults are the standard Ultralytics ones; the CPU batch of 16 is applied by the
worker when `batch` is -1. GPUs come from the worker heartbeat on the shared volume,
because the api container has no torch: a missing, stale or malformed file simply means
"no GPU" and never an error.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.models import Project
from yolo_trainer_api.schemas import (
    GpuOption,
    OfficialModelOption,
    TrainingDefaults,
    TrainingDevices,
    TrainingOptions,
)
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_api.training.catalog import default_official, official_models
from yolo_trainer_common.heartbeat import (
    HEARTBEAT_MAX_AGE_SECONDS,
    is_heartbeat_fresh,
    read_heartbeat,
)
from yolo_trainer_common.layout import heartbeat_file

DEFAULT_EPOCHS = 100
DEFAULT_IMGSZ = 640
DEFAULT_BATCH = -1
DEFAULT_DEVICE = "auto"

NO_GPU_DETAIL = "No GPU is available."


def devices_from_heartbeat(settings: Settings) -> TrainingDevices:
    """One GPU entry only while a fresh heartbeat reports CUDA; otherwise none."""
    path = heartbeat_file(settings.data_dir)
    if not is_heartbeat_fresh(path, HEARTBEAT_MAX_AGE_SECONDS):
        return TrainingDevices(gpus=[], worker_fresh=False)
    payload = read_heartbeat(path) or {}
    if payload.get("cuda_available") is True:
        name = payload.get("device_name")
        return TrainingDevices(
            gpus=[GpuOption(index=0, name=name if isinstance(name, str) and name else "GPU")],
            worker_fresh=True,
        )
    return TrainingDevices(gpus=[], worker_fresh=True)


def ensure_device_available(settings: Settings, device: str) -> None:
    """Refuse `device == "0"` unless a fresh worker heartbeat reports CUDA (D-09)."""
    if device == "0" and not devices_from_heartbeat(settings).gpus:
        raise HTTPException(status_code=422, detail=NO_GPU_DETAIL)


async def build_options(
    session: AsyncSession, settings: Settings, project: Project
) -> TrainingOptions:
    return TrainingOptions(
        task_type=project.task_type,
        next_run_name=await service.next_run_name(session, project.id),
        official=[
            OfficialModelOption(name=name, size=size)
            for name, size in official_models(project.task_type)
        ],
        default_base=default_official(project.task_type),
        defaults=TrainingDefaults(
            epochs=DEFAULT_EPOCHS,
            imgsz=DEFAULT_IMGSZ,
            batch=DEFAULT_BATCH,
            device=DEFAULT_DEVICE,
        ),
        devices=devices_from_heartbeat(settings),
    )
