"""GET /api/config exposes the server's upload limits to the client (DATA-01, D-04)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings

from .conftest import make_client


def test_config_reports_default_limits(client: TestClient) -> None:
    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json() == {
        "max_upload_mb": 50,
        "max_upload_bytes": 50_000_000,
        "accepted_extensions": ["jpg", "jpeg", "png", "webp", "bmp"],
    }


def test_config_follows_custom_settings(tmp_path: Path) -> None:
    custom = Settings(
        data_dir=tmp_path / "data",
        allowed_hosts=["testserver"],
        max_upload_mb=7,
    )

    with make_client(custom) as client:
        body = client.get("/api/config").json()

    assert body["max_upload_mb"] == 7
    assert body["max_upload_bytes"] == 7_000_000
