"""Neighbors of an image in grid order: one ordering shared by the list and the editor (D-03).

Rows are bulk-inserted into the migrated SQLite file (like the list tests), so the
walk comparisons run against the real list endpoint with no files on disk.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert

from yolo_trainer_api.models import Image, normalize_project_name
from yolo_trainer_api.settings import Settings

# Upload order is also id order. "b.jpg" and "a.jpg" repeat with different content.
FILENAMES = ["c.jpg", "a.jpg", "b.jpg", "b.jpg", "cat.png", "a.jpg"]


def _create_project(client: TestClient, name: str) -> int:
    response = client.post("/api/projects", json={"name": name, "task_type": "detect"})
    assert response.status_code == 201
    return response.json()["id"]


def _insert_rows(settings: Settings, project_id: int, filenames: list[str]) -> None:
    rows = [
        {
            "project_id": project_id,
            "original_filename": name,
            "filename_key": normalize_project_name(name),
            "ext": "jpg",
            "sha256": f"{project_id:08x}{serial:056x}",
            "size_bytes": 1000,
            "width": 64,
            "height": 48,
        }
        for serial, name in enumerate(filenames)
    ]
    engine = create_engine(settings.sync_database_url)
    try:
        with engine.begin() as connection:
            connection.execute(insert(Image), rows)
    finally:
        engine.dispose()


def _grid(client: TestClient, project_id: int, **params: str) -> list[int]:
    response = client.get(f"/api/projects/{project_id}/images", params={"limit": 500, **params})
    assert response.status_code == 200
    return [item["id"] for item in response.json()["items"]]


def _neighbors(client: TestClient, project_id: int, image_id: int, **params: str) -> dict:
    response = client.get(f"/api/projects/{project_id}/images/{image_id}/neighbors", params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def project(client: TestClient, settings: Settings) -> int:
    project_id = _create_project(client, "Nav")
    _insert_rows(settings, project_id, FILENAMES)
    return project_id


@pytest.mark.parametrize("sort", ["newest", "name"])
def test_neighbors_equal_the_grid_order_for_every_image(
    client: TestClient, project: int, sort: str
) -> None:
    order = _grid(client, project, sort=sort)
    assert len(order) == len(FILENAMES)
    for index, image_id in enumerate(order):
        body = _neighbors(client, project, image_id, sort=sort)
        assert body == {
            "position": index + 1,
            "total": len(order),
            "prev_id": order[index - 1] if index > 0 else None,
            "next_id": order[index + 1] if index + 1 < len(order) else None,
        }


@pytest.mark.parametrize("sort", ["newest", "name"])
def test_walking_next_id_visits_the_filtered_list_order(
    client: TestClient, project: int, sort: str
) -> None:
    order = _grid(client, project, sort=sort, q="jpg")
    assert len(order) == 5  # every name but cat.png
    walked = [order[0]]
    while True:
        body = _neighbors(client, project, walked[-1], sort=sort, q="jpg")
        if body["next_id"] is None:
            break
        walked.append(body["next_id"])
        assert len(walked) <= len(order)
    assert walked == order


def test_equal_filenames_are_ordered_by_id_in_both_list_and_neighbors(
    client: TestClient, project: int
) -> None:
    order = _grid(client, project, sort="name")
    by_name = {}
    for image_id in order:
        item = client.get(f"/api/projects/{project}/images/{image_id}").json()
        by_name.setdefault(item["filename"], []).append(image_id)
    for ids in by_name.values():
        assert ids == sorted(ids)
    # the two b.jpg are adjacent and neighbors agree with the list
    first_b, second_b = by_name["b.jpg"]
    assert _neighbors(client, project, first_b, sort="name")["next_id"] == second_b
    assert _neighbors(client, project, second_b, sort="name")["prev_id"] == first_b


@pytest.mark.parametrize("sort", ["newest", "name"])
def test_ends_have_no_neighbor_in_that_direction(
    client: TestClient, project: int, sort: str
) -> None:
    order = _grid(client, project, sort=sort)
    first = _neighbors(client, project, order[0], sort=sort)
    last = _neighbors(client, project, order[-1], sort=sort)
    assert first["prev_id"] is None
    assert first["position"] == 1
    assert last["next_id"] is None
    assert last["position"] == len(order)


def test_single_image_project(client: TestClient, settings: Settings) -> None:
    project_id = _create_project(client, "Solo")
    _insert_rows(settings, project_id, ["only.jpg"])
    (image_id,) = _grid(client, project_id)
    assert _neighbors(client, project_id, image_id) == {
        "position": 1,
        "total": 1,
        "prev_id": None,
        "next_id": None,
    }


@pytest.mark.parametrize("sort", ["newest", "name"])
def test_image_outside_the_search_has_no_position_but_nearest_filtered_neighbors(
    client: TestClient, project: int, sort: str
) -> None:
    everything = _grid(client, project, sort=sort)
    filtered = _grid(client, project, sort=sort, q="cat")
    assert len(filtered) == 1
    outsider = next(image_id for image_id in everything if image_id not in filtered)
    body = _neighbors(client, project, outsider, sort=sort, q="cat")
    assert body["position"] is None
    assert body["total"] == len(filtered)
    # every id returned belongs to the filtered grid
    assert {body["prev_id"], body["next_id"]} <= {*filtered, None}
    # the single filtered image lies on exactly one side of the pivot
    assert [body["prev_id"], body["next_id"]].count(filtered[0]) == 1


def test_foreign_image_is_404(client: TestClient, project: int, settings: Settings) -> None:
    other = _create_project(client, "Other")
    _insert_rows(settings, other, ["x.jpg"])
    (foreign_id,) = _grid(client, other)
    response = client.get(f"/api/projects/{project}/images/{foreign_id}/neighbors")
    assert response.status_code == 404
    assert response.json()["detail"] == "Image not found."


def test_unknown_project_is_404(client: TestClient) -> None:
    assert client.get("/api/projects/999/images/1/neighbors").status_code == 404


def test_bogus_sort_and_overlong_search_are_422(client: TestClient, project: int) -> None:
    image_id = _grid(client, project)[0]
    base = f"/api/projects/{project}/images/{image_id}/neighbors"
    assert client.get(base, params={"sort": "bogus"}).status_code == 422
    assert client.get(base, params={"q": "x" * 256}).status_code == 422
    assert client.get(base, params={"q": "x" * 255}).status_code == 200
