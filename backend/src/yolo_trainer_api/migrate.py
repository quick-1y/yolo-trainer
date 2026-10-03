"""Programmatic Alembic migration runner (no reliance on cwd or alembic.ini)."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory


def _alembic_config(sqlalchemy_url: str | None = None) -> Config:
    migrations_dir = Path(__file__).resolve().parent / "migrations"
    cfg = Config()
    cfg.set_main_option("script_location", str(migrations_dir))
    if sqlalchemy_url is not None:
        cfg.set_main_option("sqlalchemy.url", sqlalchemy_url)
    return cfg


def run_migrations(settings) -> None:  # noqa: ANN001 - Settings import kept loose to avoid cycles
    """Run `alembic upgrade head` against the given settings' database."""
    command.upgrade(_alembic_config(settings.sync_database_url), "head")


def migration_head() -> str:
    """Return the current head revision id of the migration scripts."""
    head = ScriptDirectory.from_config(_alembic_config()).get_current_head()
    if head is None:
        raise RuntimeError("No Alembic migrations found.")
    return head
