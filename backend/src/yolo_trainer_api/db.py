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


def create_engine_for(settings) -> AsyncEngine:  # noqa: ANN001 - Settings import would be circular-ish, keep loose
    """Create the async engine and register the SQLite pragma tuning listener.

    Pragmas are set on every new DB-API connection (not per-session), per the
    standard SQLAlchemy + aiosqlite pairing for WAL mode.
    """
    engine = create_async_engine(settings.async_database_url)

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncGenerator[AsyncSession]:
    """FastAPI dependency yielding an AsyncSession bound to the app's engine."""
    sessionmaker: async_sessionmaker[AsyncSession] = request.app.state.sessionmaker
    async with sessionmaker() as session:
        yield session
