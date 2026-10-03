"""Contract tests for the original-file route (ANNO-01, D-10, T2-10-01/02)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from yolo_trainer_api import storage
from yolo_trainer_api.settings import Settings

from .test_images_api import create_project, make_jpeg, make_png, upload


def _upload_one(client: TestClient, project_id: int, name: str, data: bytes, mime: str) -> int:
    response = upload(client, project_id, [(name, data, mime)])
    return response.json()["results"][0]["image"]["id"]


def test_file_returns_the_stored_png_bytes_with_immutable_cache(client: TestClient) -> None:
    project_id = create_project(client)
    data = make_png((64, 48))
    image_id = _upload_one(client, project_id, "cat.png", data, "image/png")

    response = client.get(f"/api/projects/{project_id}/images/{image_id}/file")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert "immutable" in response.headers["cache-control"]
    assert response.content == data


def test_file_media_type_follows_the_stored_format_not_the_client_name(
    client: TestClient,
) -> None:
    project_id = create_project(client)
    data = make_jpeg((300, 100))
    # Misleading client filename and content type: the stored extension decides.
    image_id = _upload_one(client, project_id, "sneaky.png", data, "image/png")

    response = client.get(f"/api/projects/{project_id}/images/{image_id}/file")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content == data


def test_file_under_another_project_is_404(client: TestClient) -> None:
    owner = create_project(client, "Owner")
    other = create_project(client, "Other")
    image_id = _upload_one(client, owner, "a.png", make_png(), "image/png")

    response = client.get(f"/api/projects/{other}/images/{image_id}/file")

    assert response.status_code == 404
    assert response.json() == {"detail": "Image not found."}


def test_file_for_an_unknown_id_is_404(client: TestClient) -> None:
    project_id = create_project(client)

    response = client.get(f"/api/projects/{project_id}/images/99999/file")

    assert response.status_code == 404
    assert response.json() == {"detail": "Image not found."}


def test_file_missing_on_disk_is_404(client: TestClient, settings: Settings) -> None:
    project_id = create_project(client)
    image_id = _upload_one(client, project_id, "a.png", make_png(), "image/png")
    storage.image_path(settings, project_id, image_id, "png").unlink()

    response = client.get(f"/api/projects/{project_id}/images/{image_id}/file")

    assert response.status_code == 404
    assert response.json() == {"detail": "Image not found."}
