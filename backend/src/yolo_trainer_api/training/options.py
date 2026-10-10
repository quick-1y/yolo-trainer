"""What the "New training" form offers: bases, defaults, devices and the dataset (D-04..D-09).

The defaults are the standard Ultralytics ones; the CPU batch of 16 is applied by the
worker when `batch` is -1. GPUs come from the worker heartbeat on the shared volume,
because the api container has no torch: a missing, stale or malformed file simply means
"no GPU" and never an error.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from yolo_trainer_api.annotations import unannotated_clause
from yolo_trainer_api.models import Annotation, Image, Project, ProjectClass, TrainedModel
from yolo_trainer_api.schemas import (
    DatasetSummary,
    GpuOption,
    OfficialModelOption,
    SplitUsage,
    TrainedModelOption,
    TrainingDefaults,
    TrainingDevices,
    TrainingNote,
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


async def _class_names(session: AsyncSession, project_id: int) -> list[str]:
    """The project's class names in YOLO index order."""
    return list(
        (
            await session.execute(
                select(ProjectClass.name)
                .where(ProjectClass.project_id == project_id)
                .order_by(ProjectClass.position, ProjectClass.id)
            )
        ).scalars()
    )


async def dataset_summary(session: AsyncSession, project_id: int) -> DatasetSummary:
    """What a run started now would use, per split (D-06).

    "Used" is the snapshot's rule: an image with a split that is flagged background or has
    a box. "Not annotated" is an image with a split that the snapshot leaves out (D-04);
    images without a split are never used and are counted apart.
    """
    usable = or_(Image.is_background.is_(True), exists().where(Annotation.image_id == Image.id))
    rows = (
        await session.execute(
            select(
                Image.split,
                func.count(Image.id),
                func.sum(case((usable, 1), else_=0)),
                func.sum(case((unannotated_clause(), 1), else_=0)),
            )
            .where(Image.project_id == project_id)
            .group_by(Image.split)
        )
    ).all()
    per_split = {split: SplitUsage(used=0, unannotated=0) for split in ("train", "valid", "test")}
    unassigned = 0
    for split, total, used, unannotated in rows:
        if split is None:
            unassigned = int(total)
        else:
            per_split[split] = SplitUsage(used=int(used or 0), unannotated=int(unannotated or 0))
    class_count = (
        await session.execute(
            select(func.count(ProjectClass.id)).where(ProjectClass.project_id == project_id)
        )
    ).scalar_one()
    return DatasetSummary(
        train=per_split["train"],
        valid=per_split["valid"],
        test=per_split["test"],
        unassigned=unassigned,
        class_count=int(class_count),
    )


async def _classes_without_examples(
    session: AsyncSession, project_id: int, split: str
) -> list[str]:
    present = (
        select(Annotation.class_id)
        .join(Image, Image.id == Annotation.image_id)
        .where(Image.project_id == project_id, Image.split == split)
    )
    return list(
        (
            await session.execute(
                select(ProjectClass.name)
                .where(ProjectClass.project_id == project_id, ProjectClass.id.not_in(present))
                .order_by(ProjectClass.position, ProjectClass.id)
            )
        ).scalars()
    )


async def dataset_notes(
    session: AsyncSession, settings: Settings, project_id: int, summary: DatasetSummary
) -> tuple[list[TrainingNote], list[TrainingNote]]:
    """`(blockers, warnings)` as codes with parameters; the client words them (D-04, D-05).

    Blockers stop Start (and `POST .../runs` refuses the same cases). Warnings never do.
    """
    blockers = [
        TrainingNote(code=code)
        for code in service.blocker_codes(
            summary.class_count, summary.train.used, summary.valid.used
        )
    ]
    warnings: list[TrainingNote] = []
    unannotated = summary.train.unannotated + summary.valid.unannotated + summary.test.unannotated
    if unannotated:
        warnings.append(TrainingNote(code="unannotated", count=unannotated))
    if summary.unassigned:
        warnings.append(TrainingNote(code="unassigned", count=summary.unassigned))
    if summary.class_count:
        for split, code in (("train", "classesMissingTrain"), ("valid", "classesMissingValid")):
            if getattr(summary, split).used == 0:
                continue  # an empty split is a blocker already
            missing = await _classes_without_examples(session, project_id, split)
            if missing:
                warnings.append(TrainingNote(code=code, count=len(missing), names=missing))
    if not devices_from_heartbeat(settings).worker_fresh:
        warnings.append(TrainingNote(code="workerStale"))
    return blockers, warnings


async def eligible_models(session: AsyncSession, project: Project) -> list[TrainedModelOption]:
    """Models trained in this service for the project's task type, newest first (D-08).

    Models of the other task type are never offered, and `service.create_run` refuses
    them as well. `classes_match` is true only for the same names in the same order.
    """
    project_classes = await _class_names(session, project.id)
    rows = (
        await session.execute(
            select(TrainedModel, Project.name)
            .outerjoin(Project, Project.id == TrainedModel.project_id)
            .where(TrainedModel.task_type == project.task_type)
            .order_by(TrainedModel.created_at.desc(), TrainedModel.id.desc())
        )
    ).all()
    return [
        TrainedModelOption(
            id=model.id,
            name=model.name,
            project_id=model.project_id,
            project_name=project_name,
            map50=model.map50,
            class_count=len(model.class_names),
            class_names=list(model.class_names),
            classes_match=list(model.class_names) == project_classes,
            created_at=model.created_at,
        )
        for model, project_name in rows
    ]


async def build_options(
    session: AsyncSession, settings: Settings, project: Project
) -> TrainingOptions:
    summary = await dataset_summary(session, project.id)
    blockers, warnings = await dataset_notes(session, settings, project.id, summary)
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
        models=await eligible_models(session, project),
        summary=summary,
        blockers=blockers,
        warnings=warnings,
    )
