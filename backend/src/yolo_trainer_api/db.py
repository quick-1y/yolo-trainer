"""Async SQLAlchemy engine/session setup with SQLite WAL tuning."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def apply_sqlite_pragmas(dbapi_connection, journal_mode: str) -> None:  # noqa: ANN001
    """Apply the standard SQLite pragma tuning to a raw DB-API connection.

    Extracted from the engine's connect listener so it is directly testable
    against a plain stdlib `sqlite3` connection. `journal_mode` must already
    be constrained to a known-safe value (see `Settings.sqlite_journal_mode`,
    a `Literal["WAL", "DELETE"]`) - it is interpolated into a PRAGMA and must
    never be derived from request data (T-02-04).
    """
    cursor = dbapi_connection.cursor()
    cursor.execute(f"PRAGMA journal_mode={journal_mode}")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_engine_for(settings) -> AsyncEngine:  # noqa: ANN001 - Settings import would be circular-ish, keep loose
    """Create the async engine and register the SQLite pragma tuning listener.

    Pragmas are set on every new DB-API connection (not per-session), per the
    standard SQLAlchemy + aiosqlite pairing for WAL mode.
    """
    engine = create_async_engine(settings.async_database_url)
    journal_mode = settings.sqlite_journal_mode

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        apply_sqlite_pragmas(dbapi_connection, journal_mode)

    return engine


async def checkpoint_wal(engine: AsyncEngine, journal_mode: str) -> None:
    """Checkpoint and truncate the WAL file on graceful shutdown.

    Only meaningful in WAL mode (DELETE mode has no WAL/shared-memory file).
    Keeps the window of unflushed pages small on Docker Desktop's cross-VM
    bind mount (RESEARCH "Common Pitfalls" #1 mitigation 2).
    """
    if journal_mode != "WAL":
        return
    async with engine.connect() as connection:
        await connection.exec_driver_sql("PRAGMA wal_checkpoint(TRUNCATE)")


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency yielding an AsyncSession bound to the app's engine."""
    sessionmaker: async_sessionmaker[AsyncSession] = request.app.state.sessionmaker
    async with sessionmaker() as session:
        yield session
