"""Programmatic Alembic migration runner (no reliance on cwd or alembic.ini)."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config


def run_migrations(settings) -> None:  # noqa: ANN001 - Settings import kept loose to avoid cycles
    """Run `alembic upgrade head` against the given settings' database."""
    migrations_dir = Path(__file__).resolve().parent / "migrations"
    cfg = Config()
    cfg.set_main_option("script_location", str(migrations_dir))
    cfg.set_main_option("sqlalchemy.url", settings.sync_database_url)
    command.upgrade(cfg, "head")
