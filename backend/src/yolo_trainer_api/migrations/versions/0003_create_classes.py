"""create classes table

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-03

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # AUTOINCREMENT so class ids are never reused: later annotations reference
    # `classes.id` (never the index), so a recycled id would silently relabel
    # objects of a deleted class (D-13).
    op.create_table(
        "classes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.Text(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(color) = 7", name="ck_classes_color"),
        sqlite_autoincrement=True,
    )
    op.create_index(
        "uq_classes_project_normalized_name",
        "classes",
        ["project_id", "normalized_name"],
        unique=True,
    )
    # Deliberately NOT unique: the shift-on-delete UPDATE (a later plan) could
    # violate a unique constraint on position mid-statement.
    op.create_index("ix_classes_project_position", "classes", ["project_id", "position"])


def downgrade() -> None:
    op.drop_index("ix_classes_project_position", table_name="classes")
    op.drop_index("uq_classes_project_normalized_name", table_name="classes")
    op.drop_table("classes")
