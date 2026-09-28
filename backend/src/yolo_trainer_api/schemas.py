"""Pydantic request/response schemas."""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, field_serializer, model_validator

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

    @field_serializer("created_at", "updated_at")
    def _serialize_utc(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")
