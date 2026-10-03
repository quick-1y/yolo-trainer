"""Tests for scripts/seed_images.py (the SC2 large-project seeding aid).

The script lives outside the backend package, so it is loaded by file path.
Starlette's TestClient is an `httpx.Client` subclass, which lets the very same
code that talks to a live server run against the in-process app.
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
from pathlib import Path
from types import ModuleType

from fastapi.testclient import TestClient
from PIL import Image

SEED_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "seed_images.py"


def load_seed_module() -> ModuleType:
    assert SEED_SCRIPT.is_file(), f"{SEED_SCRIPT} does not exist"
    spec = importlib.util.spec_from_file_location("seed_images", SEED_SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_make_unique_jpeg_yields_distinct_valid_images() -> None:
    seed_images = load_seed_module()

    digests = set()
    for i in range(300):
        data = seed_images.make_unique_jpeg(i)
        digests.add(hashlib.sha256(data).hexdigest())
        if i % 100 == 0:
            with Image.open(io.BytesIO(data)) as image:
                assert image.format == "JPEG"
                assert image.size == (640, 480)

    assert len(digests) == 300


def test_make_unique_jpeg_is_deterministic_per_index_and_seed() -> None:
    seed_images = load_seed_module()

    assert seed_images.make_unique_jpeg(7, seed=3) == seed_images.make_unique_jpeg(7, seed=3)
    assert seed_images.make_unique_jpeg(7, seed=3) != seed_images.make_unique_jpeg(7, seed=4)


def test_resolve_project_creates_once_then_reuses_by_name(client: TestClient) -> None:
    seed_images = load_seed_module()

    first = seed_images.resolve_project(client, None, "seed-test")
    second = seed_images.resolve_project(client, None, "SEED-test")

    assert first == second
    listed = client.get("/api/projects").json()
    assert [item["id"] for item in listed if item["name"] == "seed-test"] == [first]
    assert next(item for item in listed if item["id"] == first)["task_type"] == "detect"


def test_seed_adds_all_then_reports_duplicates_on_rerun(client: TestClient) -> None:
    seed_images = load_seed_module()
    project_id = seed_images.resolve_project(client, None, "seed-test")

    first = seed_images.seed(client, project_id, 30, batch_size=7, workers=3)
    assert first == {"added": 30, "duplicate": 0, "rejected": 0}
    assert client.get(f"/api/projects/{project_id}/images").json()["total"] == 30

    second = seed_images.seed(client, project_id, 30, batch_size=7, workers=3)
    assert second == {"added": 0, "duplicate": 30, "rejected": 0}
    assert client.get(f"/api/projects/{project_id}/images").json()["total"] == 30
