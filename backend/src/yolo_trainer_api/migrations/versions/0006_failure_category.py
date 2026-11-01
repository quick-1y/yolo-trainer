"""training run failure category

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-11

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NULL for every run that exists before this migration and for every run that did not fail.
    # No CHECK on purpose: the code set is validated in Python against `failures.CATEGORIES`, so
    # a new code never needs a table rebuild (D-16). The status CHECK is not touched.
    op.add_column("training_runs", sa.Column("error_category", sa.String(length=32), nullable=True))


def downgrade() -> None:
    # The batch rebuild would drop AUTOINCREMENT: without it SQLite reuses the id of a deleted
    # last run, and `runs/<id>` folders and model files are named after that id.
    with op.batch_alter_table(
        "training_runs", table_kwargs={"sqlite_autoincrement": True}
    ) as batch:
        batch.drop_column("error_category")
