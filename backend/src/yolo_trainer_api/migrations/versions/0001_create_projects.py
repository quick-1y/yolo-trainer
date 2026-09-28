"""create projects table

Revision ID: 0001
Revises:
Create Date: 2026-09-28

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.Text(), nullable=False),
        sa.Column("task_type", sa.String(length=16), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("task_type IN ('detect', 'segment')", name="ck_projects_task_type"),
    )
    op.create_index(
        "uq_projects_normalized_name",
        "projects",
        ["normalized_name"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_projects_normalized_name", table_name="projects")
    op.drop_table("projects")
