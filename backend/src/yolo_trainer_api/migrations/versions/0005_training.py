"""image splits, training runs and the model registry

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-05

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `images.split` is NULL for "unassigned": every image that exists before
    # this migration, and every new upload, starts unassigned (D-01). The named
    # CHECK is added in ONE portable statement because SQLite can only attach a
    # table-level constraint by rebuilding `images`, and a batch rebuild risks
    # the AUTOINCREMENT flag and the index set of a table every other table
    # references.
    op.execute(
        "ALTER TABLE images ADD COLUMN split VARCHAR(5) "
        "CONSTRAINT ck_images_split CHECK (split IN ('train', 'valid', 'test'))"
    )
    op.create_index("ix_images_project_split", "images", ["project_id", "split"])

    # `base_model_id` references `models`, which is created below: SQLite
    # resolves references at DML time, so the cycle with `models.source_run_id`
    # is legal. A Postgres port declares this FK with use_alter.
    op.create_table(
        "training_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.Text(), nullable=False),
        # All seven statuses now: a CHECK cannot be altered in place later (Phase 5
        # adds `cancelled` behavior, not a new value).
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("task_type", sa.String(length=16), nullable=False),
        sa.Column("base_kind", sa.String(length=16), nullable=False),
        sa.Column("base_name", sa.String(length=100), nullable=False),
        sa.Column(
            "base_model_id",
            sa.Integer(),
            sa.ForeignKey("models.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("resolved", sa.JSON(), nullable=True),
        sa.Column("dataset_counts", sa.JSON(), nullable=True),
        sa.Column("class_names", sa.JSON(), nullable=True),
        sa.Column("metrics", sa.JSON(), nullable=True),
        sa.Column("epoch", sa.Integer(), nullable=True),
        sa.Column("epochs", sa.Integer(), nullable=True),
        sa.Column("last_map50", sa.Float(), nullable=True),
        sa.Column("worker_pid", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("log_tail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("progress_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('preparing', 'queued', 'running', 'completed', 'failed', "
            "'interrupted', 'cancelled')",
            name="ck_training_runs_status",
        ),
        sa.CheckConstraint("task_type IN ('detect', 'segment')", name="ck_training_runs_task_type"),
        sa.CheckConstraint("base_kind IN ('official', 'model')", name="ck_training_runs_base_kind"),
        sqlite_autoincrement=True,
    )
    op.create_index(
        "uq_training_runs_project_name",
        "training_runs",
        ["project_id", "normalized_name"],
        unique=True,
    )
    op.create_index("ix_training_runs_status_id", "training_runs", ["status", "id"])
    op.create_index("ix_training_runs_project_id", "training_runs", ["project_id"])
    op.create_index("ix_training_runs_base_model_id", "training_runs", ["base_model_id"])

    # `project_id` is nullable because a Phase 7 upload belongs to no project.
    op.create_table(
        "models",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "source_run_id",
            sa.Integer(),
            sa.ForeignKey("training_runs.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("task_type", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("class_names", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=True),
        sa.Column("precision", sa.Float(), nullable=True),
        sa.Column("recall", sa.Float(), nullable=True),
        sa.Column("map50", sa.Float(), nullable=True),
        sa.Column("map50_95", sa.Float(), nullable=True),
        sa.Column("base_name", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("ultralytics_version", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("task_type IN ('detect', 'segment')", name="ck_models_task_type"),
        sa.CheckConstraint("source IN ('trained', 'uploaded')", name="ck_models_source"),
        sqlite_autoincrement=True,
    )
    op.create_index("ix_models_project_id", "models", ["project_id"])
    op.create_index("ix_models_source_run_id", "models", ["source_run_id"])
    op.create_index("ix_models_task_type", "models", ["task_type"])


def downgrade() -> None:
    op.drop_index("ix_models_task_type", table_name="models")
    op.drop_index("ix_models_source_run_id", table_name="models")
    op.drop_index("ix_models_project_id", table_name="models")
    op.drop_table("models")
    op.drop_index("ix_training_runs_base_model_id", table_name="training_runs")
    op.drop_index("ix_training_runs_project_id", table_name="training_runs")
    op.drop_index("ix_training_runs_status_id", table_name="training_runs")
    op.drop_index("uq_training_runs_project_name", table_name="training_runs")
    op.drop_table("training_runs")
    op.drop_index("ix_images_project_split", table_name="images")
    with op.batch_alter_table("images") as batch:
        # The named CHECK mentions the column, so it has to go first.
        batch.drop_constraint("ck_images_split", type_="check")
        batch.drop_column("split")
