"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_serializer, field_validator

TaskType = Literal["detect", "segment"]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    task_type: TaskType
    description: str | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        stripped = value.strip()
        if not (1 <= len(stripped) <= 100):
            raise ValueError("must be between 1 and 100 characters")
        return stripped

    @field_validator("description")
    @classmethod
    def _validate_description(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 2000:
            raise ValueError("must be at most 2000 characters")
        return value


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
