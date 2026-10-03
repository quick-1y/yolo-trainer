"""create images table

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # AUTOINCREMENT so ids are never reused: thumbnail URLs are cached as
    # immutable, and a reused id would show the wrong picture.
    op.create_table(
        "images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("filename_key", sa.Text(), nullable=False),
        sa.Column("ext", sa.String(length=4), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("ext IN ('jpg', 'png', 'webp', 'bmp')", name="ck_images_ext"),
        sqlite_autoincrement=True,
    )
    op.create_index("ix_images_project_id_id", "images", ["project_id", "id"])
    op.create_index(
        "ix_images_project_filename_key", "images", ["project_id", "filename_key", "id"]
    )
    op.create_index("uq_images_project_sha256", "images", ["project_id", "sha256"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_images_project_sha256", table_name="images")
    op.drop_index("ix_images_project_filename_key", table_name="images")
    op.drop_index("ix_images_project_id_id", table_name="images")
    op.drop_table("images")
