"""Alembic environment script.

Runs both programmatically (via `yolo_trainer_api.migrate.run_migrations`, which
sets `sqlalchemy.url` on the Config object at runtime - no `.ini` needed) and
from the CLI (`alembic -c backend/alembic.ini upgrade head`, which sets
`script_location` there). No `fileConfig()` call here since there may be no
`.ini` file backing this Config at all when invoked programmatically.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Import models so they're registered on Base.metadata before migrations run.
from yolo_trainer_api import models  # noqa: F401
from yolo_trainer_api.db import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
