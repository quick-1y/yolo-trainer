"""training run resume bookkeeping

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-11

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Every run that exists before this migration was never resumed (0) and has no finished
    # running segment accounted (0 seconds); the other columns stay NULL. `resume_epoch` is
    # deliberately not backfilled in SQL: the checkpoint epoch of a Phase 4 run is derived from
    # its progress events when it is read or resumed (D-10).
    op.add_column(
        "training_runs",
        sa.Column("resume_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("training_runs", sa.Column("resume_epoch", sa.Integer(), nullable=True))
    op.add_column(
        "training_runs", sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "training_runs",
        sa.Column("active_seconds", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "training_runs",
        sa.Column("segment_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # The batch rebuild would drop AUTOINCREMENT: without it SQLite reuses the id of a deleted
    # last run, and `runs/<id>` folders and model files are named after that id.
    with op.batch_alter_table(
        "training_runs", table_kwargs={"sqlite_autoincrement": True}
    ) as batch:
        batch.drop_column("segment_started_at")
        batch.drop_column("active_seconds")
        batch.drop_column("queued_at")
        batch.drop_column("resume_epoch")
        batch.drop_column("resume_count")
