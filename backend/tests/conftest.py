"""Shared pytest fixtures for the backend test suite.

Every fixture here runs against a real, per-test SQLite file under `tmp_path`
and a real Alembic migration (no database mocking, per D-20/D-27).
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yolo_trainer_api.main import create_app
from yolo_trainer_api.settings import Settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Fresh settings pointing at an isolated, per-test DATA_DIR."""
    return Settings(data_dir=tmp_path / "data")


def make_client(settings: Settings) -> TestClient:
    """Build a `TestClient` for the given settings.

    Callers MUST use the return value as a context manager
    (`with make_client(settings) as c:`) so FastAPI's lifespan
    (which creates DATA_DIR and runs migrations) actually executes.
    Exposed as a plain helper (not a fixture) so tests can open and close
    multiple app instances against the same DATA_DIR, e.g. to simulate an
    app restart.
    """
    return TestClient(create_app(settings))


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """A `TestClient` with migrations already applied against a temp DATA_DIR."""
    with make_client(settings) as test_client:
        yield test_client
