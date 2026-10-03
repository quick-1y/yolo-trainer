"""Contract tests for image upload, listing and thumbnails (DATA-01, ANNO-01).

They drive the real app (TestClient over a temp-file SQLite database with real
Alembic migrations and a real DATA_DIR on disk) - nothing is mocked.
Fixture images are generated in-test with Pillow.
"""

from __future__ import annotations

import io
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from yolo_trainer_api.settings import Settings

from .conftest import make_client

XHR = {"X-Requested-With": "yolo-trainer"}


def make_png(
    size: tuple[int, int] = (64, 48), color: tuple[int, int, int] = (200, 30, 30)
) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, "PNG")
    return buffer.getvalue()


def make_jpeg(size: tuple[int, int] = (300, 100), orientation: int | None = None) -> bytes:
    buffer = io.BytesIO()
    image = Image.new("RGB", size, (20, 120, 220))
    if orientation is None:
        image.save(buffer, "JPEG")
    else:
        exif = Image.Exif()
        exif[0x0112] = orientation
        image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()


def create_project(client: TestClient, name: str = "Images") -> int:
    response = client.post("/api/projects", json={"name": name, "task_type": "detect"})
    assert response.status_code == 201
    return response.json()["id"]


def upload(
    client: TestClient,
    project_id: int,
    files: list[tuple[str, bytes, str]],
    headers: dict[str, str] | None = XHR,
):
    return client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", item) for item in files],
        headers=headers or {},
    )


def image_rows(settings: Settings, sql: str = "SELECT id, ext FROM images ORDER BY id"):
    connection = sqlite3.connect(settings.db_path)
    try:
        return connection.execute(sql).fetchall()
    finally:
        connection.close()


def project_files(settings: Settings, project_id: int) -> list[Path]:
    root = settings.data_dir / "projects" / str(project_id)
    return [path for path in root.rglob("*") if path.is_file()] if root.exists() else []


def test_upload_png_stores_byte_identical_original_and_webp_thumbnail(
    client: TestClient, settings: Settings
) -> None:
    project_id = create_project(client)
    data = make_png((64, 48))

    response = upload(client, project_id, [("cat.png", data, "image/png")])

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["status"] == "added"
    assert result["filename"] == "cat.png"
    assert result["image"]["width"] == 64
    assert result["image"]["height"] == 48
    image_id = result["image"]["id"]

    original = settings.data_dir / "projects" / str(project_id) / "images" / f"{image_id}.png"
    assert original.read_bytes() == data  # D-17: stored original is untouched

    thumb = settings.data_dir / "projects" / str(project_id) / "thumbs" / f"{image_id}.webp"
    with Image.open(thumb) as thumb_image:
        assert thumb_image.format == "WEBP"
        assert max(thumb_image.size) <= settings.thumbnail_size


def test_extension_comes_from_the_decoded_format_not_the_filename(
    client: TestClient, settings: Settings
) -> None:
    project_id = create_project(client)

    response = upload(client, project_id, [("photo.jpg", make_png(), "image/jpeg")])

    result = response.json()["results"][0]
    assert result["status"] == "added"
    image_id = result["image"]["id"]
    assert (
        settings.data_dir / "projects" / str(project_id) / "images" / f"{image_id}.png"
    ).is_file()
    assert image_rows(settings) == [(image_id, "png")]


def test_upload_without_requested_with_header_is_forbidden_and_stores_nothing(
    client: TestClient, settings: Settings
) -> None:
    project_id = create_project(client)

    response = upload(client, project_id, [("cat.png", make_png(), "image/png")], headers=None)

    assert response.status_code == 403
    assert response.json() == {"detail": "Missing required request header."}
    assert image_rows(settings) == []
    assert not (settings.data_dir / "projects").exists()


def test_non_image_bytes_are_rejected_and_staging_is_cleaned(
    client: TestClient, settings: Settings
) -> None:
    project_id = create_project(client)

    response = upload(client, project_id, [("x.jpg", b"definitely not an image", "image/jpeg")])

    result = response.json()["results"][0]
    assert result["status"] == "rejected"
    assert result["reason"]
    assert result["image"] is None
    assert image_rows(settings) == []
    assert project_files(settings, project_id) == []


def test_same_bytes_twice_are_reported_as_duplicate(client: TestClient, settings: Settings) -> None:
    project_id = create_project(client)
    data = make_png()

    first = upload(client, project_id, [("a.png", data, "image/png")]).json()["results"][0]
    second = upload(client, project_id, [("renamed.png", data, "image/png")]).json()["results"][0]

    assert first["status"] == "added"
    assert second["status"] == "duplicate"
    assert second["reason"] == "Already present in this project."
    assert len(image_rows(settings)) == 1
    assert len(project_files(settings, project_id)) == 2  # original + thumbnail only


def test_same_filename_with_different_content_is_added_twice(
    client: TestClient, settings: Settings
) -> None:
    project_id = create_project(client)

    response = upload(
        client,
        project_id,
        [
            ("same.png", make_png(color=(255, 0, 0)), "image/png"),
            ("same.png", make_png(color=(0, 255, 0)), "image/png"),
        ],
    )

    statuses = [item["status"] for item in response.json()["results"]]
    assert statuses == ["added", "added"]
    assert len(image_rows(settings)) == 2


def test_mixed_batch_keeps_request_order(client: TestClient) -> None:
    project_id = create_project(client)

    response = upload(
        client,
        project_id,
        [
            ("a.png", make_png(color=(1, 2, 3)), "image/png"),
            ("garbage.png", b"\x00\x01\x02garbage", "image/png"),
            ("b.png", make_png(color=(4, 5, 6)), "image/png"),
        ],
    )

    results = response.json()["results"]
    assert [item["status"] for item in results] == ["added", "rejected", "added"]
    assert [item["filename"] for item in results] == ["a.png", "garbage.png", "b.png"]


def test_upload_to_unknown_project_is_404(client: TestClient) -> None:
    response = upload(client, 9999, [("a.png", make_png(), "image/png")])

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found."}


def test_path_traversal_filename_never_reaches_the_filesystem(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    project_id = create_project(client)

    response = upload(client, project_id, [("../../evil.png", make_png(), "image/png")])

    result = response.json()["results"][0]
    assert result["status"] == "added"
    assert result["filename"] == "evil.png"
    image_id = result["image"]["id"]
    assert (
        settings.data_dir / "projects" / str(project_id) / "images" / f"{image_id}.png"
    ).is_file()
    assert not list(tmp_path.rglob("evil.png"))
    for path in tmp_path.rglob("*"):
        if path.is_file() and "projects" in path.parts:
            assert path.is_relative_to(settings.data_dir / "projects" / str(project_id))


@pytest.mark.parametrize(
    ("orientation", "expected"),
    [(1, (300, 100)), (3, (300, 100)), (6, (100, 300)), (8, (100, 300)), (5, (100, 300))],
)
def test_reported_size_is_exif_orientation_corrected(
    client: TestClient, orientation: int, expected: tuple[int, int]
) -> None:
    project_id = create_project(client)

    response = upload(
        client, project_id, [("rot.jpg", make_jpeg((300, 100), orientation), "image/jpeg")]
    )

    image = response.json()["results"][0]["image"]
    assert (image["width"], image["height"]) == expected


def test_exif_rotated_thumbnail_is_upright(client: TestClient, settings: Settings) -> None:
    project_id = create_project(client)

    response = upload(client, project_id, [("rot.jpg", make_jpeg((300, 100), 6), "image/jpeg")])

    image_id = response.json()["results"][0]["image"]["id"]
    thumb = settings.data_dir / "projects" / str(project_id) / "thumbs" / f"{image_id}.webp"
    with Image.open(thumb) as thumb_image:
        assert thumb_image.height > thumb_image.width


def test_list_is_newest_first_with_total(client: TestClient) -> None:
    project_id = create_project(client)
    for index in range(3):
        upload(client, project_id, [(f"{index}.png", make_png(color=(index, 0, 0)), "image/png")])

    body = client.get(f"/api/projects/{project_id}/images").json()

    ids = [item["id"] for item in body["items"]]
    assert ids == sorted(ids, reverse=True)
    assert body["total"] == 3
    assert body["next_cursor"] is None
    assert set(body["items"][0]) == {
        "id",
        "filename",
        "width",
        "height",
        "size_bytes",
        "created_at",
    }
    assert body["items"][0]["created_at"].endswith("Z")


def test_list_pages_with_keyset_cursor(client: TestClient) -> None:
    project_id = create_project(client)
    for index in range(3):
        upload(client, project_id, [(f"{index}.png", make_png(color=(index, 0, 0)), "image/png")])

    first = client.get(f"/api/projects/{project_id}/images", params={"limit": 2}).json()
    assert len(first["items"]) == 2
    assert first["next_cursor"] is not None

    second = client.get(
        f"/api/projects/{project_id}/images",
        params={"limit": 2, "cursor": first["next_cursor"]},
    ).json()
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None
    seen = [item["id"] for item in first["items"] + second["items"]]
    assert len(set(seen)) == 3
    assert seen == sorted(seen, reverse=True)
    assert second["total"] == 3


@pytest.mark.parametrize("cursor", ["!!!", "bm90LWpzb24", "e30", "eyJzIjoibmFtZSIsImkiOjF9"])
def test_malformed_cursor_is_422(client: TestClient, cursor: str) -> None:
    project_id = create_project(client)

    response = client.get(f"/api/projects/{project_id}/images", params={"cursor": cursor})

    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid cursor."}


def test_thumbnail_is_webp_with_immutable_cache_header(client: TestClient) -> None:
    project_id = create_project(client)
    image_id = upload(client, project_id, [("a.png", make_png(), "image/png")]).json()["results"][
        0
    ]["image"]["id"]

    response = client.get(f"/api/projects/{project_id}/images/{image_id}/thumbnail")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert "immutable" in response.headers["cache-control"]
    assert response.content[:4] == b"RIFF"


def test_thumbnail_under_another_project_is_404(client: TestClient) -> None:
    owner = create_project(client, "Owner")
    other = create_project(client, "Other")
    image_id = upload(client, owner, [("a.png", make_png(), "image/png")]).json()["results"][0][
        "image"
    ]["id"]

    response = client.get(f"/api/projects/{other}/images/{image_id}/thumbnail")

    assert response.status_code == 404
    assert response.json() == {"detail": "Image not found."}


def test_images_and_thumbnails_survive_an_app_restart(settings: Settings) -> None:
    with make_client(settings) as first_client:
        project_id = create_project(first_client)
        image_id = upload(first_client, project_id, [("a.png", make_png(), "image/png")]).json()[
            "results"
        ][0]["image"]["id"]

    with make_client(settings) as second_client:
        body = second_client.get(f"/api/projects/{project_id}/images").json()
        assert body["total"] == 1
        thumb = second_client.get(f"/api/projects/{project_id}/images/{image_id}/thumbnail")
        assert thumb.status_code == 200


def test_image_ids_are_never_reused_after_a_delete(client: TestClient, settings: Settings) -> None:
    project_id = create_project(client)
    first_id = upload(
        client, project_id, [("a.png", make_png(color=(1, 1, 1)), "image/png")]
    ).json()["results"][0]["image"]["id"]
    connection = sqlite3.connect(settings.db_path)
    try:
        connection.execute("DELETE FROM images WHERE id = ?", (first_id,))
        connection.commit()
    finally:
        connection.close()

    second_id = upload(
        client, project_id, [("b.png", make_png(color=(2, 2, 2)), "image/png")]
    ).json()["results"][0]["image"]["id"]

    assert second_id > first_id


def test_deleting_a_project_cascades_to_its_image_rows(
    client: TestClient, settings: Settings
) -> None:
    project_id = create_project(client)
    upload(client, project_id, [("a.png", make_png(), "image/png")])
    assert len(image_rows(settings)) == 1

    assert client.delete(f"/api/projects/{project_id}").status_code == 204

    assert image_rows(settings) == []


def test_empty_file_is_rejected(client: TestClient) -> None:
    project_id = create_project(client)

    result = upload(client, project_id, [("empty.png", b"", "image/png")]).json()["results"][0]

    assert result["status"] == "rejected"
    assert result["reason"] == "The file is empty."


def test_file_over_the_size_cap_is_rejected_without_being_stored(settings: Settings) -> None:
    capped = settings.model_copy(update={"max_upload_mb": 1})
    with make_client(capped) as client:
        project_id = create_project(client)

        result = upload(
            client, project_id, [("big.png", b"\x89PNG" + b"0" * 1_000_100, "image/png")]
        ).json()["results"][0]

        assert result["status"] == "rejected"
        assert result["reason"] == "The file is larger than 1 MB."
        assert image_rows(capped) == []
        assert project_files(capped, project_id) == []


def test_image_over_the_pixel_cap_is_rejected_before_decoding(settings: Settings) -> None:
    capped = settings.model_copy(update={"max_image_megapixels": 1})
    with make_client(capped) as client:
        project_id = create_project(client)

        result = upload(
            client, project_id, [("wide.png", make_png((1100, 1000)), "image/png")]
        ).json()["results"][0]

        assert result["status"] == "rejected"
        assert "too many pixels" in result["reason"]


def test_image_smaller_than_ten_pixels_is_rejected(client: TestClient) -> None:
    project_id = create_project(client)

    result = upload(client, project_id, [("tiny.png", make_png((5, 5)), "image/png")]).json()[
        "results"
    ][0]

    assert result["status"] == "rejected"
    assert "too small" in result["reason"]


def test_truncated_jpeg_is_rejected(client: TestClient) -> None:
    project_id = create_project(client)
    data = make_jpeg((640, 480))

    result = upload(client, project_id, [("cut.jpg", data[: len(data) // 2], "image/jpeg")]).json()[
        "results"
    ][0]

    assert result["status"] == "rejected"


def test_unsupported_format_is_rejected(client: TestClient) -> None:
    project_id = create_project(client)
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32)).save(buffer, "GIF")

    result = upload(client, project_id, [("a.gif", buffer.getvalue(), "image/gif")]).json()[
        "results"
    ][0]

    assert result["status"] == "rejected"
    assert result["reason"].startswith("Unsupported image format")


@pytest.mark.parametrize("mode", ["L", "LA", "P", "RGBA", "I;16", "CMYK"])
def test_common_pixel_modes_are_accepted(client: TestClient, mode: str) -> None:
    project_id = create_project(client)
    buffer = io.BytesIO()
    image = Image.new(mode, (40, 30))
    image.save(buffer, "JPEG" if mode == "CMYK" else "PNG")

    result = upload(client, project_id, [(f"{mode}.img", buffer.getvalue(), "image/png")]).json()[
        "results"
    ][0]

    assert result["status"] == "added", result
