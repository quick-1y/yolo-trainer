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
    model_validator,
)

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


class ImageDeleteRequest(BaseModel):
    """Ids to hard-delete; 1..1000 per request (T2-11-02)."""

    model_config = ConfigDict(extra="forbid")

    ids: list[int] = Field(min_length=1, max_length=1000)


class ImageDeleteResult(BaseModel):
    deleted: int


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
