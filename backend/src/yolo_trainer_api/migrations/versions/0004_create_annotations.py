"""create annotations table and image annotation state

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-04

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Image-level annotation state. `annotation_version` is the optimistic
    # concurrency counter of the whole box set (D-12); "annotated" is NOT stored
    # because a class delete cascades annotations at DB level (D-13).
    op.add_column(
        "images",
        sa.Column("is_background", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "images",
        sa.Column("is_reviewed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "images",
        sa.Column("annotation_version", sa.Integer(), nullable=False, server_default="0"),
    )

    # The id is a client-generated UUID v4 so ids inside undo snapshots stay
    # valid forever. `kind` already allows 'polygon' so a later phase adds a
    # nullable column without rebuilding the table. x/y/w/h are normalized
    # top-left coordinates relative to the EXIF-oriented image.
    op.create_table(
        "annotations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "image_id",
            sa.Integer(),
            sa.ForeignKey("images.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "class_id",
            sa.Integer(),
            sa.ForeignKey("classes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="box"),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("w", sa.Float(), nullable=False),
        sa.Column("h", sa.Float(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('box', 'polygon')", name="ck_annotations_kind"),
    )
    # SQLite does not index child FK columns on its own; the derived box count
    # and the class cascade both depend on these two.
    op.create_index("ix_annotations_image_id", "annotations", ["image_id"])
    op.create_index("ix_annotations_class_id", "annotations", ["class_id"])


def downgrade() -> None:
    op.drop_index("ix_annotations_class_id", table_name="annotations")
    op.drop_index("ix_annotations_image_id", table_name="annotations")
    op.drop_table("annotations")
    with op.batch_alter_table("images") as batch:
        batch.drop_column("annotation_version")
        batch.drop_column("is_reviewed")
        batch.drop_column("is_background")
