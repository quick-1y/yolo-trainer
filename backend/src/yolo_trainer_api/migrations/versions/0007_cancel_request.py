"""training run cancel request

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-11

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NULL for every run that exists before this migration and for every run nobody asked to
    # cancel. The api sets it, the worker supervisor reads it each tick (D-07); the api never
    # signals a process. The status CHECK is not touched: `cancelled` has been allowed since 0005.
    op.add_column(
        "training_runs",
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # The batch rebuild would drop AUTOINCREMENT: without it SQLite reuses the id of a deleted
    # last run, and `runs/<id>` folders and model files are named after that id.
    with op.batch_alter_table(
        "training_runs", table_kwargs={"sqlite_autoincrement": True}
    ) as batch:
        batch.drop_column("cancel_requested_at")
