"""Next-unannotated and status-counts: the editor's work queue (D-13..D-16, ANNO-09, ANNO-10).

Images are bulk-inserted like the navigation tests; their state (boxes, background,
reviewed) is then set through the real save endpoint so the derived status is the one
the product computes.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert

from yolo_trainer_api.models import Image, normalize_project_name
from yolo_trainer_api.settings import Settings

XHR = {"X-Requested-With": "yolo-trainer"}


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


def _add_class(client: TestClient, project_id: int) -> int:
    response = client.post(f"/api/projects/{project_id}/classes", json={"name": "car"})
    assert response.status_code == 201
    return response.json()["id"]


def _save(
    client: TestClient,
    project_id: int,
    image_id: int,
    class_id: int | None,
    *,
    boxes: int = 0,
    background: bool = False,
    reviewed: bool = False,
) -> None:
    body = {
        "base_version": 0,
        "is_background": background,
        "is_reviewed": reviewed,
        "boxes": [
            {"id": str(uuid.uuid4()), "class_id": class_id, "x": 0.1, "y": 0.1, "w": 0.4, "h": 0.4}
            for _ in range(boxes)
        ],
    }
    response = client.put(
        f"/api/projects/{project_id}/images/{image_id}/annotations", json=body, headers=XHR
    )
    assert response.status_code == 200, response.text


def _next(client: TestClient, project_id: int, **params: object) -> int | None:
    response = client.get(f"/api/projects/{project_id}/images/next-unannotated", params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"image_id"}
    return body["image_id"]


def _counts(client: TestClient, project_id: int, **params: object) -> dict:
    response = client.get(f"/api/projects/{project_id}/images/status-counts", params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def queue(client: TestClient, settings: Settings) -> dict:
    """Five images A..E in newest-first grid order; B and D are unannotated, the rest have a box."""
    project_id = _create_project(client, "Queue")
    class_id = _add_class(client, project_id)
    # Newest first means the last inserted is first in the grid: insert E..A.
    _insert_rows(settings, project_id, ["e.jpg", "d.jpg", "c.jpg", "b.jpg", "a.jpg"])
    order = _grid(client, project_id)
    a, b, c, d, e = order
    for image_id in (a, c, e):
        _save(client, project_id, image_id, class_id, boxes=1)
    return {"project": project_id, "class": class_id, "a": a, "b": b, "c": c, "d": d, "e": e}


def test_literal_routes_are_not_shadowed_by_the_image_id_route(
    client: TestClient, queue: dict
) -> None:
    project_id = queue["project"]
    assert client.get(f"/api/projects/{project_id}/images/next-unannotated").status_code == 200
    assert client.get(f"/api/projects/{project_id}/images/status-counts").status_code == 200
    detail = client.get(f"/api/projects/{project_id}/images/{queue['a']}")
    assert detail.status_code == 200
    assert detail.json()["id"] == queue["a"]


def test_next_unannotated_follows_grid_order_and_wraps(client: TestClient, queue: dict) -> None:
    project_id = queue["project"]
    assert _next(client, project_id, after=queue["a"]) == queue["b"]
    assert _next(client, project_id, after=queue["b"]) == queue["d"]
    assert _next(client, project_id, after=queue["c"]) == queue["d"]
    # wrap: after the last unannotated image and after the last image of the grid
    assert _next(client, project_id, after=queue["d"]) == queue["b"]
    assert _next(client, project_id, after=queue["e"]) == queue["b"]
    # no pivot: the first unannotated image from the start
    assert _next(client, project_id) == queue["b"]


def test_when_the_current_image_is_the_only_unannotated_one_the_answer_is_null(
    client: TestClient, queue: dict
) -> None:
    project_id = queue["project"]
    _save(client, project_id, queue["d"], queue["class"], boxes=1)
    assert _next(client, project_id, after=queue["b"]) is None
    assert _next(client, project_id, after=queue["a"]) == queue["b"]


def test_nothing_unannotated_returns_null(client: TestClient, queue: dict) -> None:
    project_id = queue["project"]
    _save(client, project_id, queue["b"], queue["class"], boxes=1)
    _save(client, project_id, queue["d"], queue["class"], boxes=1)
    assert _next(client, project_id) is None
    assert _next(client, project_id, after=queue["c"]) is None


def test_next_unannotated_respects_name_sort_and_search(client: TestClient, queue: dict) -> None:
    project_id = queue["project"]
    # name order is a, b, c, d, e (the same as the newest order here, ids ascending in name)
    by_name = _grid(client, project_id, sort="name")
    assert by_name == [queue[k] for k in "abcde"]
    assert _next(client, project_id, sort="name", after=queue["a"]) == queue["b"]
    assert _next(client, project_id, sort="name", after=queue["e"]) == queue["b"]
    # search keeps only c, d, e: b is outside the search and is never returned
    assert _next(client, project_id, sort="name", q="d.jpg") == queue["d"]
    assert _next(client, project_id, q="c.jpg") is None
    assert _next(client, project_id, q="b.jpg", after=queue["b"]) is None
    assert _next(client, project_id, q="d.jpg", after=queue["b"]) == queue["d"]


def test_background_annotated_and_reviewed_images_are_never_returned(
    client: TestClient, queue: dict
) -> None:
    project_id = queue["project"]
    _save(client, project_id, queue["b"], None, background=True)
    _save(client, project_id, queue["d"], queue["class"], boxes=1, reviewed=True)
    assert _next(client, project_id) is None


def test_an_unannotated_image_that_is_not_background_is_still_queued(
    client: TestClient, queue: dict
) -> None:
    """Prohibition guard: no boxes and no flag means unannotated, never background (ANNO-10)."""
    project_id = queue["project"]
    detail = client.get(f"/api/projects/{project_id}/images/{queue['b']}").json()
    assert detail["status"] == "unannotated"
    assert detail["is_background"] is False
    page = client.get(f"/api/projects/{project_id}/images").json()["items"]
    listed = {item["id"]: item for item in page}
    assert listed[queue["b"]]["status"] == "unannotated"
    counts = _counts(client, project_id)
    assert counts["unannotated"] == 2
    assert counts["background"] == 0
    assert _next(client, project_id, after=queue["a"]) == queue["b"]


def test_foreign_after_is_404(client: TestClient, queue: dict, settings: Settings) -> None:
    other = _create_project(client, "Other")
    _insert_rows(settings, other, ["x.jpg"])
    (foreign_id,) = _grid(client, other)
    response = client.get(
        f"/api/projects/{queue['project']}/images/next-unannotated", params={"after": foreign_id}
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Image not found."


def test_unknown_project_bogus_sort_and_overlong_search(client: TestClient, queue: dict) -> None:
    assert client.get("/api/projects/999/images/next-unannotated").status_code == 404
    assert client.get("/api/projects/999/images/status-counts").status_code == 404
    base = f"/api/projects/{queue['project']}/images/next-unannotated"
    assert client.get(base, params={"sort": "bogus"}).status_code == 422
    assert client.get(base, params={"q": "x" * 256}).status_code == 422
    assert client.get(base, params={"q": "x" * 255}).status_code == 200


def test_empty_project(client: TestClient) -> None:
    project_id = _create_project(client, "Empty")
    assert _next(client, project_id) is None
    assert _counts(client, project_id) == {
        "total": 0,
        "unannotated": 0,
        "annotated": 0,
        "reviewed": 0,
        "background": 0,
    }


def test_status_counts_split_the_derived_statuses_and_count_background_apart(
    client: TestClient, settings: Settings
) -> None:
    project_id = _create_project(client, "Counts")
    class_id = _add_class(client, project_id)
    _insert_rows(settings, project_id, ["u.jpg", "a1.jpg", "a2.jpg", "bg.jpg", "rv.jpg"])
    u, a1, a2, bg, rv = sorted(_grid(client, project_id))
    _save(client, project_id, a1, class_id, boxes=1)
    _save(client, project_id, a2, class_id, boxes=3)
    _save(client, project_id, bg, None, background=True)
    _save(client, project_id, rv, class_id, boxes=1, reviewed=True)
    counts = _counts(client, project_id)
    assert counts == {"total": 5, "unannotated": 1, "annotated": 3, "reviewed": 1, "background": 1}
    assert counts["unannotated"] + counts["annotated"] + counts["reviewed"] == counts["total"]
    assert u  # the untouched image is the unannotated one
    # a background image reports annotated with zero boxes
    detail = client.get(f"/api/projects/{project_id}/images/{bg}").json()
    assert detail["status"] == "annotated"
    assert detail["box_count"] == 0
    # a reviewed background image counts as reviewed and still as background
    _save_second = client.get(f"/api/projects/{project_id}/images/{bg}/annotations").json()
    response = client.put(
        f"/api/projects/{project_id}/images/{bg}/annotations",
        json={
            "base_version": _save_second["version"],
            "is_background": True,
            "is_reviewed": True,
            "boxes": [],
        },
        headers=XHR,
    )
    assert response.status_code == 200
    assert _counts(client, project_id) == {
        "total": 5,
        "unannotated": 1,
        "annotated": 2,
        "reviewed": 2,
        "background": 1,
    }


def test_status_counts_ignore_the_search(client: TestClient, queue: dict) -> None:
    project_id = queue["project"]
    plain = _counts(client, project_id)
    assert plain == {"total": 5, "unannotated": 2, "annotated": 3, "reviewed": 0, "background": 0}
    assert _counts(client, project_id, q="a.jpg") == plain


def test_a_server_rejects_background_together_with_boxes(client: TestClient, queue: dict) -> None:
    response = client.put(
        f"/api/projects/{queue['project']}/images/{queue['b']}/annotations",
        json={
            "base_version": 0,
            "is_background": True,
            "is_reviewed": False,
            "boxes": [
                {
                    "id": str(uuid.uuid4()),
                    "class_id": queue["class"],
                    "x": 0.1,
                    "y": 0.1,
                    "w": 0.3,
                    "h": 0.3,
                }
            ],
        },
        headers=XHR,
    )
    assert response.status_code == 422
