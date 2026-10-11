"""Pydantic request/response schemas."""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_serializer,
    field_validator,
    model_validator,
)

from yolo_trainer_common.quality import quality_level

TaskType = Literal["detect", "segment"]

# U+0000-U+001F (C0 controls) and U+007F (DEL). Rejected in names to keep
# stored/displayed project names free of unprintable characters (D-08).
_CONTROL_CHARS = frozenset(chr(code_point) for code_point in range(0x20)) | {chr(0x7F)}


def _validate_project_name(value: str) -> str:
    """NFC-normalize, trim, and enforce the name rules (D-07, D-08).

    Length is counted in Unicode code points (`len()` on a `str`), matching
    how the stored `normalized_name` uniqueness index compares names.
    """
    normalized = unicodedata.normalize("NFC", value).strip()
    if not normalized:
        raise ValueError("must not be empty")
    if len(normalized) > 100:
        raise ValueError("must be at most 100 characters")
    if any(char in _CONTROL_CHARS for char in normalized):
        raise ValueError("must not contain control characters")
    return normalized


def _validate_project_description(value: str | None) -> str | None:
    """Trim; blank becomes `None`; enforce the max length (D-07)."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > 2000:
        raise ValueError("must be at most 2000 characters")
    return stripped


# Reusable annotated types (also used by Plan 09's ProjectUpdate).
ProjectName = Annotated[str, AfterValidator(_validate_project_name)]
ProjectDescription = Annotated[str | None, AfterValidator(_validate_project_description)]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: ProjectName
    task_type: TaskType
    description: ProjectDescription = None


class ProjectUpdate(BaseModel):
    """Partial update: only `name` and `description` may change (D-09).

    `task_type` is refused outright (fixed at creation, D-09). `name` cannot
    be explicitly cleared to `null` - a project always needs a name - but an
    omitted `name` key leaves the current name untouched (distinguished via
    `model_fields_set` in the router, not via this schema's defaults).
    """

    model_config = ConfigDict(extra="forbid")

    name: ProjectName | None = None
    description: ProjectDescription = None

    @model_validator(mode="before")
    @classmethod
    def _reject_task_type_and_null_name(cls, data: object) -> object:
        if isinstance(data, dict):
            if "task_type" in data:
                raise ValueError("The task type cannot be changed after a project is created.")
            if "name" in data and data["name"] is None:
                raise ValueError("name must not be null")
        return data


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    task_type: TaskType
    description: str | None
    created_at: datetime
    updated_at: datetime
    image_count: int = 0
    class_count: int = 0
    run_count: int = 0
    model_count: int = 0
    active_run_count: int = 0

    @field_serializer("created_at", "updated_at")
    def _serialize_utc(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")


# Class names follow exactly the project-name rules (D-12).
ClassName = ProjectName
HexColor = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$"), AfterValidator(str.upper)]


class ClassCreate(BaseModel):
    """Create body. There is deliberately no index/position field: indices are
    derived from creation order and `extra="forbid"` refuses one (D-13, D-14)."""

    model_config = ConfigDict(extra="forbid")

    name: ClassName
    color: HexColor | None = None


class ClassUpdate(BaseModel):
    """Partial update (used by the rename/recolor endpoint); explicit nulls are refused."""

    model_config = ConfigDict(extra="forbid")

    name: ClassName | None = None
    color: HexColor | None = None

    @model_validator(mode="before")
    @classmethod
    def _reject_null_fields(cls, data: object) -> object:
        if isinstance(data, dict):
            if "name" in data and data["name"] is None:
                raise ValueError("name must not be null")
            if "color" in data and data["color"] is None:
                raise ValueError("color must not be null")
        return data


class ClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    name: str
    color: str
    index: int = Field(validation_alias="position")
    created_at: datetime
    object_count: int = 0

    @field_serializer("created_at")
    def _serialize_utc(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")


ImageStatus = Literal["unannotated", "annotated", "reviewed"]

# Dataset split of an image (D-01); `None` means unassigned.
Split = Literal["train", "valid", "test"]

# About 170 JSON bytes per box keeps a full set under nginx's unchanged 1 MiB
# /api/ body limit.
MAX_BOXES = 2000


def derive_status(box_count: int, is_background: bool, is_reviewed: bool) -> ImageStatus:
    """Status is derived, never stored (D-13): reviewed > annotated > unannotated."""
    if is_reviewed:
        return "reviewed"
    if box_count > 0 or is_background:
        return "annotated"
    return "unannotated"


class ImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    filename: str = Field(validation_alias="original_filename")
    width: int
    height: int
    size_bytes: int
    created_at: datetime
    box_count: int = 0
    is_background: bool = False
    is_reviewed: bool = False
    split: Split | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def status(self) -> ImageStatus:
        return derive_status(self.box_count, self.is_background, self.is_reviewed)

    @field_serializer("created_at")
    def _serialize_utc(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------------
# Annotations (boxes)
# --------------------------------------------------------------------------

Unit = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
PositiveUnit = Annotated[float, Field(gt=0.0, le=1.0, allow_inf_nan=False)]
UUID_V4_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


class BoxIn(BaseModel):
    """One box of a save request: normalized top-left x/y and size w/h."""

    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, Field(pattern=UUID_V4_PATTERN)]
    class_id: Annotated[int, Field(ge=1)]
    x: Unit
    y: Unit
    w: PositiveUnit
    h: PositiveUnit

    @model_validator(mode="after")
    def _inside_image(self) -> BoxIn:
        if self.x + self.w > 1 + 1e-6 or self.y + self.h > 1 + 1e-6:
            raise ValueError("The box must lie inside the image.")
        return self


class BoxRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    class_id: int
    x: float
    y: float
    w: float
    h: float


class AnnotationSave(BaseModel):
    """Whole-set replace of one image's boxes, guarded by `base_version` (D-12)."""

    model_config = ConfigDict(extra="forbid")

    base_version: Annotated[int, Field(ge=0)]
    is_background: bool
    is_reviewed: bool
    boxes: Annotated[list[BoxIn], Field(max_length=MAX_BOXES)]

    @model_validator(mode="after")
    def _structure(self) -> AnnotationSave:
        if len({box.id for box in self.boxes}) != len(self.boxes):
            raise ValueError("Each box needs a unique id.")
        if self.is_background and self.boxes:
            raise ValueError("A background image cannot have boxes.")
        if self.is_reviewed and not self.boxes and not self.is_background:
            raise ValueError("Only an annotated image can be marked as reviewed.")
        return self


class AnnotationSetRead(BaseModel):
    version: int
    is_background: bool
    is_reviewed: bool
    status: ImageStatus
    boxes: list[BoxRead]


class SaveResult(BaseModel):
    version: int
    box_count: int
    status: ImageStatus
    is_background: bool
    is_reviewed: bool


class ImagePage(BaseModel):
    items: list[ImageRead]
    next_cursor: str | None
    total: int


class Neighbors(BaseModel):
    """Where an image sits in the grid order of one sort and search (D-03).

    `position` is null when the image itself does not match the search; `prev_id`
    and `next_id` are then the nearest filtered images around its sort key.
    """

    position: int | None
    total: int
    prev_id: int | None
    next_id: int | None


class NextUnannotated(BaseModel):
    """The first unannotated image after the current one in grid order, or null (D-16)."""

    image_id: int | None


class SplitCounts(BaseModel):
    """Images per split; `none` is the unassigned ones (D-01)."""

    train: int
    valid: int
    test: int
    none: int


class StatusCounts(BaseModel):
    """Project-wide status counts; unannotated + annotated + reviewed = total.

    `background` counts the flagged images separately: they are also counted in
    `annotated` (or `reviewed`), never in `unannotated`. `splits` counts every
    image once: train + valid + test + none = total.
    """

    total: int
    unannotated: int
    annotated: int
    reviewed: int
    background: int
    splits: SplitCounts


class ImageDeleteRequest(BaseModel):
    """Ids to hard-delete; 1..1000 per request (T2-11-02)."""

    model_config = ConfigDict(extra="forbid")

    ids: list[int] = Field(min_length=1, max_length=1000)


class ImageDeleteResult(BaseModel):
    deleted: int


class SplitRequest(BaseModel):
    """Assign the listed images to one split, or to none (`null`); 1..1000 ids per request.

    `split` has no default on purpose: omitting it is an error, `null` is a choice.
    """

    model_config = ConfigDict(extra="forbid")

    ids: list[int] = Field(min_length=1, max_length=1000)
    split: Split | None


class SplitResult(BaseModel):
    updated: int


UploadStatus = Literal["added", "duplicate", "rejected"]


class UploadResult(BaseModel):
    filename: str
    status: UploadStatus
    reason: str | None = None
    image: ImageRead | None = None


class UploadResponse(BaseModel):
    results: list[UploadResult]


class ConfigRead(BaseModel):
    """Server-side upload limits, so the client pre-filter cannot drift from them."""

    max_upload_mb: int
    max_upload_bytes: int
    accepted_extensions: list[str]


# --------------------------------------------------------------------------
# Training runs
# --------------------------------------------------------------------------

RunStatus = Literal[
    "preparing", "queued", "running", "completed", "failed", "interrupted", "cancelled"
]
# A run in one of these statuses holds the queue or the worker (D-11, D-21).
ACTIVE_RUN_STATUSES = ("preparing", "queued", "running")

DeviceChoice = Literal["auto", "cpu", "0"]
QualityLevel = Literal["excellent", "good", "fair", "poor"]


def _utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat().replace("+00:00", "Z")


class OfficialBase(BaseModel):
    """An official Ultralytics model chosen by name; never a path (T4-01)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["official"]
    name: Annotated[str, Field(max_length=32)]


class ModelBase(BaseModel):
    """A model registered in this service, chosen by id; never a path (T4-01, T4-08-01)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["model"]
    model_id: Annotated[int, Field(strict=True, ge=1)]


RunBase = Annotated[OfficialBase | ModelBase, Field(discriminator="kind")]


class RunCreate(BaseModel):
    """Start a training run (TRAN-01); every bound is enforced again here (T4-07)."""

    model_config = ConfigDict(extra="forbid")

    name: ProjectName | None = None
    base: RunBase
    epochs: Annotated[int, Field(strict=True, ge=1, le=1000)]
    imgsz: Annotated[int, Field(strict=True, ge=32, le=2048)]
    batch: Annotated[int, Field(strict=True)]
    device: DeviceChoice

    @field_validator("imgsz")
    @classmethod
    def _imgsz_multiple_of_32(cls, value: int) -> int:
        if value % 32 != 0:
            raise ValueError("must be a multiple of 32")
        return value

    @field_validator("batch")
    @classmethod
    def _batch_auto_or_in_range(cls, value: int) -> int:
        if value != -1 and not 1 <= value <= 512:
            raise ValueError("must be -1 (auto) or a whole number from 1 to 512")
        return value


class RunSettings(BaseModel):
    epochs: int
    imgsz: int
    batch: int
    device: DeviceChoice


class RunResolved(BaseModel):
    """What the worker actually used for an `auto` request (D-09)."""

    device: str
    batch: int
    workers: int


class DatasetCounts(BaseModel):
    train: int
    valid: int
    test: int


# --------------------------------------------------------------------------
# Auto-split (D-03)
# --------------------------------------------------------------------------

Percent = Annotated[int, Field(strict=True, ge=0, le=100)]
SeedValue = Annotated[int, Field(strict=True, ge=0, le=2**31 - 1)]


class _SplitRatios(BaseModel):
    """Whole percentages that add up to 100; Test may be 0, Train and Valid may not."""

    model_config = ConfigDict(extra="forbid")

    train: Percent
    valid: Percent
    test: Percent

    @model_validator(mode="after")
    def _ratios_make_sense(self) -> _SplitRatios:
        if self.train + self.valid + self.test != 100:
            raise ValueError("Ratios must add up to 100.")
        if self.train == 0 or self.valid == 0:
            raise ValueError("Train and Valid must be above 0.")
        return self


class AutoSplitRatios(_SplitRatios):
    """Preview request: the server picks the seed when none is given."""

    seed: SeedValue | None = None


class AutoSplitPreview(BaseModel):
    seed: int
    unassigned_total: int
    counts: DatasetCounts


class AutoSplitApply(_SplitRatios):
    """Apply request: the previewed seed and the number of unassigned images it was shown for."""

    seed: SeedValue
    expected_unassigned: Annotated[int, Field(strict=True, ge=0)]


class AutoSplitResult(BaseModel):
    counts: DatasetCounts


class RunMetrics(BaseModel):
    precision: float | None = None
    recall: float | None = None
    map50: float | None = None
    map50_95: float | None = None


class RunModelRef(BaseModel):
    id: int
    file_name: str
    size_bytes: int
    ultralytics_version: str | None = None


class RunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    status: RunStatus
    queue_position: int | None = None
    task_type: TaskType
    base_kind: Literal["official", "model"]
    base_name: str
    epoch: int | None = None
    epochs: int | None = None
    last_map50: float | None = None
    map50: float | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    model: RunModelRef | None = None
    # A stable failure code (D-16) for a failed run; NULL for runs that did not fail and for
    # runs that failed before categories existed. The UI maps an unknown code to "unknown".
    error_category: str | None = None
    # True while a user-requested cancel of a `running` run is waiting for the worker to stop it.
    cancelling: bool = False

    @computed_field  # type: ignore[prop-decorator]
    @property
    def quality(self) -> QualityLevel | None:
        """Verdict on the task's primary metric, mAP50 (RESEARCH Open Question 4)."""
        if self.map50 is None:
            return None
        return quality_level(self.map50)  # type: ignore[return-value]

    @field_serializer("created_at", "started_at", "finished_at")
    def _serialize_utc(self, value: datetime | None) -> str | None:
        return _utc_iso(value)


class ActiveRun(BaseModel):
    """The run that is training right now, with the names the global indicator shows (D-14)."""

    run_id: int
    project_id: int
    project_name: str
    run_name: str
    epoch: int | None = None
    epochs: int | None = None
    started_at: datetime | None = None

    @field_serializer("started_at")
    def _serialize_utc(self, value: datetime | None) -> str | None:
        return _utc_iso(value)


class RunRead(RunSummary):
    settings: RunSettings
    resolved: RunResolved | None = None
    dataset_counts: DatasetCounts | None = None
    class_names: list[str] | None = None
    metrics: RunMetrics | None = None
    error_message: str | None = None
    log_tail: str | None = None


# --------------------------------------------------------------------------
# Training start form (options)
# --------------------------------------------------------------------------


class OfficialModelOption(BaseModel):
    name: str
    size: Literal["n", "s", "m", "l", "x"]


class TrainingDefaults(BaseModel):
    epochs: int
    imgsz: int
    batch: int
    device: DeviceChoice


class GpuOption(BaseModel):
    index: int
    name: str


class TrainingDevices(BaseModel):
    gpus: list[GpuOption]
    worker_fresh: bool


class SplitUsage(BaseModel):
    """One split: images a run would use, and assigned images it would leave out (D-04)."""

    used: int
    unannotated: int


class DatasetSummary(BaseModel):
    """What a run started now would train on (D-06)."""

    train: SplitUsage
    valid: SplitUsage
    test: SplitUsage
    unassigned: int
    class_count: int


TrainingNoteCode = Literal[
    "noClasses",
    "trainEmpty",
    "validEmpty",
    "unannotated",
    "unassigned",
    "classesMissingTrain",
    "classesMissingValid",
    "workerStale",
]


class TrainingNote(BaseModel):
    """A blocker or a warning as a code with parameters; the client words it (D-05)."""

    code: TrainingNoteCode
    count: int = 0
    names: list[str] = Field(default_factory=list)


class TrainedModelOption(BaseModel):
    """A model trained in this service that can be the base of a new run (D-08)."""

    id: int
    name: str
    project_id: int | None
    project_name: str | None
    map50: float | None
    class_count: int
    class_names: list[str]
    classes_match: bool
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_utc(self, value: datetime) -> str | None:
        return _utc_iso(value)


class TrainingOptions(BaseModel):
    task_type: TaskType
    next_run_name: str
    official: list[OfficialModelOption]
    default_base: str
    defaults: TrainingDefaults
    devices: TrainingDevices
    models: list[TrainedModelOption]
    summary: DatasetSummary
    blockers: list[TrainingNote]
    warnings: list[TrainingNote]
