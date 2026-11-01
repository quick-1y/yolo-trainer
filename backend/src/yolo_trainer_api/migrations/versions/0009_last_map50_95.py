"""training run last-epoch mAP50-95

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-12

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing runs keep NULL: the epoch the metric would belong to was not recorded, and the
    # history table shows "—" for them unless a final value exists.
    op.add_column("training_runs", sa.Column("last_map50_95", sa.Float(), nullable=True))


def downgrade() -> None:
    # The batch rebuild would drop AUTOINCREMENT: without it SQLite reuses the id of a deleted
    # last run, and `runs/<id>` folders and model files are named after that id.
    with op.batch_alter_table(
        "training_runs", table_kwargs={"sqlite_autoincrement": True}
    ) as batch:
        batch.drop_column("last_map50_95")
