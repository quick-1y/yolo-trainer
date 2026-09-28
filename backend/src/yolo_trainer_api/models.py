"""SQLAlchemy ORM models."""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from yolo_trainer_api.db import Base


def normalize_project_name(name: str) -> str:
    """Normalize a project name for case-insensitive, Postgres-portable uniqueness."""
    return unicodedata.normalize("NFKC", name).strip().casefold()


def utcnow() -> datetime:
    return datetime.now(UTC)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)
    task_type: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        CheckConstraint("task_type IN ('detect', 'segment')", name="ck_projects_task_type"),
        Index("uq_projects_normalized_name", "normalized_name", unique=True),
    )

    def set_name(self, raw: str) -> None:
        """Set both the display name (NFC-normalized, trimmed) and the
        normalized name used for case-insensitive uniqueness checks."""
        self.name = unicodedata.normalize("NFC", raw).strip()
        self.normalized_name = normalize_project_name(raw)
