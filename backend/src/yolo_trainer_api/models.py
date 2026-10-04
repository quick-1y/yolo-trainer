"""SQLAlchemy ORM models."""

from __future__ import annotations

import unicodedata
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    false,
    func,
    select,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column

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


class Image(Base):
    """One uploaded image of a project.

    Identity is the AUTOINCREMENT integer `id` (never reused, because
    thumbnail URLs are cached as immutable). Content identity within a project
    is `(project_id, sha256)`. `original_filename` is display data only - no
    filesystem path is ever built from it (D-18). There is deliberately no ORM
    relationship to `Project`: ON DELETE CASCADE removes the rows.
    """

    __tablename__ = "images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    filename_key: Mapped[str] = mapped_column(Text, nullable=False)
    ext: Mapped[str] = mapped_column(String(4), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    # Annotation state (Phase 3). `annotation_version` is the compare-and-swap
    # counter of the image's whole box set (D-12).
    is_background: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    is_reviewed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    annotation_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    __table_args__ = (
        CheckConstraint("ext IN ('jpg', 'png', 'webp', 'bmp')", name="ck_images_ext"),
        Index("ix_images_project_id_id", "project_id", "id"),
        Index("ix_images_project_filename_key", "project_id", "filename_key", "id"),
        Index("uq_images_project_sha256", "project_id", "sha256", unique=True),
        {"sqlite_autoincrement": True},
    )


class ProjectClass(Base):
    """One annotation class of a project (a label such as `car`).

    Named `ProjectClass` to avoid the `class` keyword and any confusion with
    tags (classes and tags are distinct concepts). `position` is the stored,
    contiguous YOLO index (0..N-1). Later annotations reference `classes.id`
    with ON DELETE CASCADE and never store the index (D-13, D-16). There is
    deliberately no ORM relationship to `Project`: the FK cascade removes rows.
    """

    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    __table_args__ = (
        CheckConstraint("length(color) = 7", name="ck_classes_color"),
        Index("uq_classes_project_normalized_name", "project_id", "normalized_name", unique=True),
        Index("ix_classes_project_position", "project_id", "position"),
        {"sqlite_autoincrement": True},
    )

    def set_name(self, raw: str) -> None:
        """Set both the display name (NFC-normalized, trimmed) and the
        normalized name used for case-insensitive uniqueness checks."""
        self.name = unicodedata.normalize("NFC", raw).strip()
        self.normalized_name = normalize_project_name(raw)


class Annotation(Base):
    """One annotated object of an image (a box in Phase 3).

    The id is a client-generated UUID v4, so ids inside undo snapshots never
    need remapping. Geometry is normalized top-left x/y/w/h relative to the
    EXIF-oriented image (P2 D-17). There is deliberately no ORM relationship:
    the FK cascades remove rows when an image or a class is deleted.
    """

    __tablename__ = "annotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    image_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("images.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="box", server_default="box"
    )
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    w: Mapped[float] = mapped_column(Float, nullable=False)
    h: Mapped[float] = mapped_column(Float, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        CheckConstraint("kind IN ('box', 'polygon')", name="ck_annotations_kind"),
        Index("ix_annotations_image_id", "image_id"),
        Index("ix_annotations_class_id", "class_id"),
    )


# Read-only counts loaded together with every Project row (select and refresh).
# Attached after both child classes exist; not part of the table definition.
Project.image_count = column_property(
    select(func.count(Image.id))
    .where(Image.project_id == Project.id)
    .correlate_except(Image)
    .scalar_subquery()
)
Project.class_count = column_property(
    select(func.count(ProjectClass.id))
    .where(ProjectClass.project_id == Project.id)
    .correlate_except(ProjectClass)
    .scalar_subquery()
)
# Derived on purpose, never stored: a class delete cascades annotations at DB
# level, so a stored count would go stale (D-13). Read it after a refresh for a
# just-inserted row (MissingGreenlet otherwise).
Image.box_count = column_property(
    select(func.count(Annotation.id))
    .where(Annotation.image_id == Image.id)
    .correlate_except(Annotation)
    .scalar_subquery()
)
