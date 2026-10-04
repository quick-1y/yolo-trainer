"""API tests for the annotation save contract: CAS version, replace-set, derived status."""

from __future__ import annotations

import json
import sqlite3
import uuid

import pytest
from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings

from .conftest import make_client
from .imaging import make_image_bytes

XHR = {"X-Requested-With": "yolo-trainer"}
BOX_A = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f"
BOX_B = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d"


def _setup(client: TestClient, task_type: str = "detect") -> tuple[int, int, int]:
    project_id = client.post(
        "/api/projects", json={"name": "Boxes", "task_type": task_type}
    ).json()["id"]
    class_id = client.post(f"/api/projects/{project_id}/classes", json={"name": "car"}).json()["id"]
    response = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", ("a.png", make_image_bytes("PNG"), "image/png"))],
        headers=XHR,
    )
    image = response.json()["results"][0]["image"]
    assert image["box_count"] == 0
    assert image["status"] == "unannotated"
    return project_id, image["id"], class_id


def _body(class_id: int, *box_ids: str, base: int = 0, **flags: bool) -> dict:
    return {
        "base_version": base,
        "is_background": flags.get("is_background", False),
        "is_reviewed": flags.get("is_reviewed", False),
        "boxes": [
            {"id": box_id, "class_id": class_id, "x": 0.1, "y": 0.1, "w": 0.5, "h": 0.5}
            for box_id in box_ids
        ],
    }


def _put(client: TestClient, project_id: int, image_id: int, body: dict, headers=XHR):
    return client.put(
        f"/api/projects/{project_id}/images/{image_id}/annotations", json=body, headers=headers
    )


def test_save_replaces_set_and_reload_returns_it(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)

    saved = _put(client, project_id, image_id, _body(class_id, BOX_A))
    assert saved.status_code == 200
    assert saved.json() == {
        "version": 1,
        "box_count": 1,
        "status": "annotated",
        "is_background": False,
        "is_reviewed": False,
    }

    loaded = client.get(f"/api/projects/{project_id}/images/{image_id}/annotations").json()
    assert loaded["version"] == 1
    assert [box["id"] for box in loaded["boxes"]] == [BOX_A]

    replaced = _put(client, project_id, image_id, _body(class_id, BOX_B, base=1))
    assert replaced.json()["version"] == 2
    loaded = client.get(f"/api/projects/{project_id}/images/{image_id}/annotations").json()
    assert [box["id"] for box in loaded["boxes"]] == [BOX_B]

    detail = client.get(f"/api/projects/{project_id}/images/{image_id}").json()
    assert detail["box_count"] == 1
    assert detail["status"] == "annotated"
    listed = client.get(f"/api/projects/{project_id}/images").json()["items"][0]
    assert listed["box_count"] == 1


def test_save_requires_the_custom_header(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)

    response = _put(client, project_id, image_id, _body(class_id, BOX_A), headers={})

    assert response.status_code == 403
    assert response.json() == {"detail": "Missing required request header."}


def test_stale_base_version_conflicts_and_stores_nothing(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)
    assert _put(client, project_id, image_id, _body(class_id, BOX_A)).status_code == 200

    stale = _put(client, project_id, image_id, _body(class_id, BOX_B, base=0))

    assert stale.status_code == 409
    assert stale.json() == {
        "detail": "These annotations were changed elsewhere. Reload the image to continue."
    }
    loaded = client.get(f"/api/projects/{project_id}/images/{image_id}/annotations").json()
    assert loaded["version"] == 1
    assert [box["id"] for box in loaded["boxes"]] == [BOX_A]


def test_retry_of_an_applied_save_is_not_a_conflict(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)
    body = _body(class_id, BOX_A)
    assert _put(client, project_id, image_id, body).json()["version"] == 1

    retry = _put(client, project_id, image_id, body)

    assert retry.status_code == 200
    assert retry.json()["version"] == 1


def test_unknown_class_and_foreign_class_are_rejected_atomically(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)
    other = client.post("/api/projects", json={"name": "Other", "task_type": "detect"}).json()["id"]
    foreign_class = client.post(f"/api/projects/{other}/classes", json={"name": "plane"}).json()[
        "id"
    ]

    for bad in (class_id + 100, foreign_class):
        response = _put(client, project_id, image_id, _body(bad, BOX_A))
        assert response.status_code == 422
        assert response.json() == {"detail": "Unknown class."}

    loaded = client.get(f"/api/projects/{project_id}/images/{image_id}/annotations").json()
    assert loaded["version"] == 0
    assert loaded["boxes"] == []


def test_box_id_of_another_image_is_rejected(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)
    second = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", ("b.png", make_image_bytes("PNG", (50, 40)), "image/png"))],
        headers=XHR,
    ).json()["results"][0]["image"]["id"]
    assert _put(client, project_id, image_id, _body(class_id, BOX_A)).status_code == 200

    response = _put(client, project_id, second, _body(class_id, BOX_A))

    assert response.status_code == 422
    assert response.json() == {"detail": "A box id is already used by another image."}


def test_payload_validation_messages(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)

    duplicate = _put(client, project_id, image_id, _body(class_id, BOX_A, BOX_A))
    assert duplicate.status_code == 422
    assert "Each box needs a unique id." in duplicate.json()["detail"]

    background = _put(client, project_id, image_id, _body(class_id, BOX_A, is_background=True))
    assert "A background image cannot have boxes." in background.json()["detail"]

    reviewed = _put(client, project_id, image_id, _body(class_id, is_reviewed=True))
    assert "Only an annotated image can be marked as reviewed." in reviewed.json()["detail"]

    outside = _body(class_id, BOX_A)
    outside["boxes"][0]["x"] = 0.8
    assert (
        "The box must lie inside the image."
        in _put(client, project_id, image_id, outside).json()["detail"]
    )


def test_status_is_derived_and_image_of_another_project_is_404(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)
    other = client.post("/api/projects", json={"name": "Other", "task_type": "detect"}).json()["id"]

    background = _put(client, project_id, image_id, _body(class_id, is_background=True))
    assert background.json()["status"] == "annotated"
    reviewed = _put(
        client, project_id, image_id, _body(class_id, base=1, is_background=True, is_reviewed=True)
    )
    assert reviewed.json()["status"] == "reviewed"

    assert client.get(f"/api/projects/{other}/images/{image_id}").status_code == 404
    assert client.get(f"/api/projects/{other}/images/{image_id}/annotations").status_code == 404
    missing = _put(client, other, image_id, _body(class_id, base=0))
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Image not found."}


def test_deleting_a_class_cascades_its_boxes(client: TestClient) -> None:
    project_id, image_id, class_id = _setup(client)
    assert _put(client, project_id, image_id, _body(class_id, BOX_A)).status_code == 200

    assert client.delete(f"/api/projects/{project_id}/classes/{class_id}").status_code == 204

    detail = client.get(f"/api/projects/{project_id}/images/{image_id}").json()
    assert detail["box_count"] == 0
    assert detail["status"] == "unannotated"


# --- Plan 03-02: the save contract pinned edge by edge ---------------------------------


def _new_id() -> str:
    """A fresh lowercase UUID v4, like the client generates."""
    return str(uuid.uuid4())


def _box(class_id: int, x: float, y: float, w: float, h: float, box_id: str | None = None) -> dict:
    return {"id": box_id or _new_id(), "class_id": class_id, "x": x, "y": y, "w": w, "h": h}


def _payload(boxes: list[dict], base: int = 0, **flags: bool) -> dict:
    return {
        "base_version": base,
        "is_background": flags.get("is_background", False),
        "is_reviewed": flags.get("is_reviewed", False),
        "boxes": boxes,
    }


def _add_class(client: TestClient, project_id: int, name: str) -> int:
    response = client.post(f"/api/projects/{project_id}/classes", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def _stored(settings: Settings, image_id: int) -> tuple[int, list[tuple]]:
    """The version and the ordered rows of an image, read straight from SQLite."""
    connection = sqlite3.connect(settings.db_path)
    try:
        version = connection.execute(
            "SELECT annotation_version FROM images WHERE id = ?", (image_id,)
        ).fetchone()[0]
        rows = connection.execute(
            "SELECT id, class_id, x, y, w, h, position FROM annotations "
            "WHERE image_id = ? ORDER BY position, id",
            (image_id,),
        ).fetchall()
    finally:
        connection.close()
    return version, rows


def _annotations_url(project_id: int, image_id: int) -> str:
    return f"/api/projects/{project_id}/images/{image_id}/annotations"


def test_round_trip_returns_boxes_in_payload_order_with_their_coordinates(
    client: TestClient,
) -> None:
    project_id, image_id, car = _setup(client)
    plane = _add_class(client, project_id, "plane")
    boxes = [
        _box(car, 0.1, 0.2, 0.3, 0.4),
        _box(plane, 0.5, 0.5, 0.25, 0.125),
        _box(car, 0.0, 0.0, 1.0, 1.0),
    ]

    saved = _put(client, project_id, image_id, _payload(boxes))

    assert saved.status_code == 200
    assert saved.json() == {
        "version": 1,
        "box_count": 3,
        "status": "annotated",
        "is_background": False,
        "is_reviewed": False,
    }
    loaded = client.get(_annotations_url(project_id, image_id)).json()
    assert loaded["version"] == 1
    assert loaded["boxes"] == boxes
    detail = client.get(f"/api/projects/{project_id}/images/{image_id}").json()
    assert (detail["box_count"], detail["status"]) == (3, "annotated")
    listed = client.get(f"/api/projects/{project_id}/images").json()["items"][0]
    assert (listed["box_count"], listed["status"]) == (3, "annotated")


def test_saved_boxes_and_their_order_survive_an_app_restart(settings: Settings) -> None:
    with make_client(settings) as first_run:
        project_id, image_id, car = _setup(first_run)
        plane = _add_class(first_run, project_id, "plane")
        boxes = [
            _box(plane, 0.4, 0.4, 0.2, 0.2),
            _box(car, 0.1, 0.1, 0.2, 0.2),
            _box(plane, 0.7, 0.7, 0.3, 0.3),
        ]
        assert _put(first_run, project_id, image_id, _payload(boxes)).status_code == 200

    with make_client(settings) as second_run:
        loaded = second_run.get(_annotations_url(project_id, image_id)).json()

    assert loaded["version"] == 1
    assert loaded["boxes"] == boxes


def test_a_save_replaces_the_whole_set_and_an_empty_list_removes_every_box(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    plane = _add_class(client, project_id, "plane")
    b1, b2, b3 = _new_id(), _new_id(), _new_id()
    first = [
        _box(car, 0.1, 0.1, 0.2, 0.2, b1),
        _box(plane, 0.3, 0.3, 0.2, 0.2, b2),
        _box(car, 0.6, 0.6, 0.2, 0.2, b3),
    ]
    assert _put(client, project_id, image_id, _payload(first)).status_code == 200

    # b2 is omitted, b3 moves to the front with new geometry, b1 is reclassified.
    second = [_box(car, 0.65, 0.65, 0.3, 0.3, b3), _box(plane, 0.1, 0.1, 0.2, 0.2, b1)]
    replaced = _put(client, project_id, image_id, _payload(second, base=1))
    assert replaced.status_code == 200
    version, rows = _stored(settings, image_id)
    assert version == 2
    assert [(row[0], row[1], row[6]) for row in rows] == [(b3, car, 0), (b1, plane, 1)]
    assert (rows[0][2], rows[0][3], rows[0][4], rows[0][5]) == (0.65, 0.65, 0.3, 0.3)

    cleared = _put(client, project_id, image_id, _payload([], base=2))
    assert cleared.status_code == 200
    assert cleared.json()["box_count"] == 0
    assert cleared.json()["status"] == "unannotated"
    assert _stored(settings, image_id) == (3, [])


def test_identical_and_edge_touching_boxes_are_kept_as_separate_annotations(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    boxes = [
        _box(car, 0.2, 0.2, 0.4, 0.4),
        _box(car, 0.2, 0.2, 0.4, 0.4),
        _box(car, 0.3, 0.3, 0.4, 0.4),
        _box(car, 0.5, 0.25, 0.5, 0.75),
    ]

    saved = _put(client, project_id, image_id, _payload(boxes))

    assert saved.status_code == 200
    assert saved.json()["box_count"] == 4
    _, rows = _stored(settings, image_id)
    assert [row[0] for row in rows] == [box["id"] for box in boxes]
    assert client.get(_annotations_url(project_id, image_id)).json()["boxes"] == boxes


@pytest.mark.parametrize(
    ("label", "change", "fragment"),
    [
        ("negative x", {"x": -0.1}, "boxes.0.x"),
        ("x above one", {"x": 1.1}, "boxes.0.x"),
        ("zero width", {"w": 0}, "boxes.0.w"),
        ("zero height", {"h": 0}, "boxes.0.h"),
        ("height above one", {"h": 1.5}, "boxes.0.h"),
        ("past the right edge", {"x": 0.6, "w": 0.5}, "The box must lie inside the image."),
        ("past the bottom edge", {"y": 0.9, "h": 0.2}, "The box must lie inside the image."),
        ("id is not a uuid", {"id": "abc"}, "boxes.0.id"),
        ("uppercase uuid", {"id": "3F2B8C1E-5D4A-4E7B-9C6D-1A2B3C4D5E6F"}, "boxes.0.id"),
        ("uuid of version 1", {"id": "3f2b8c1e-5d4a-1e7b-9c6d-1a2b3c4d5e6f"}, "boxes.0.id"),
        ("unknown field", {"z": 0.5}, "boxes.0.z"),
        ("class id zero", {"class_id": 0}, "boxes.0.class_id"),
    ],
)
def test_invalid_box_is_rejected_and_nothing_changes(
    client: TestClient, settings: Settings, label: str, change: dict, fragment: str
) -> None:
    project_id, image_id, car = _setup(client)
    kept = _box(car, 0.1, 0.1, 0.2, 0.2)
    assert _put(client, project_id, image_id, _payload([kept])).status_code == 200
    before = _stored(settings, image_id)
    bad = _box(car, 0.1, 0.1, 0.2, 0.2) | change

    response = _put(client, project_id, image_id, _payload([bad], base=1))

    assert response.status_code == 422, label
    assert fragment in response.json()["detail"], label
    assert _stored(settings, image_id) == before


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_invalid_non_finite_coordinate_is_rejected_and_nothing_changes(
    client: TestClient, settings: Settings, literal: str
) -> None:
    project_id, image_id, car = _setup(client)
    before = _stored(settings, image_id)
    # Python's json module cannot emit these, so the raw JSON text is posted.
    box = (
        f'{{"id": "{_new_id()}", "class_id": {car}, "x": {literal}, "y": 0.1, "w": 0.2, "h": 0.2}}'
    )
    raw = f'{{"base_version": 0, "is_background": false, "is_reviewed": false, "boxes": [{box}]}}'

    response = client.put(
        _annotations_url(project_id, image_id),
        content=raw,
        headers={"Content-Type": "application/json", **XHR},
    )

    assert response.status_code == 422
    assert "boxes.0.x" in response.json()["detail"]
    assert _stored(settings, image_id) == before


def test_invalid_duplicate_ids_and_oversized_sets_are_rejected(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)

    shared = _new_id()
    duplicate = _put(
        client,
        project_id,
        image_id,
        _payload([_box(car, 0.1, 0.1, 0.1, 0.1, shared), _box(car, 0.5, 0.5, 0.1, 0.1, shared)]),
    )
    assert duplicate.status_code == 422
    assert "Each box needs a unique id." in duplicate.json()["detail"]

    too_many = [_box(car, 0.0, 0.0, 0.01, 0.01) for _ in range(2001)]
    oversized = _put(client, project_id, image_id, _payload(too_many))
    assert oversized.status_code == 422
    assert "boxes" in oversized.json()["detail"]
    assert _stored(settings, image_id) == (0, [])

    exactly_max = [_box(car, 0.0, 0.0, 0.01, 0.01) for _ in range(2000)]
    assert _put(client, project_id, image_id, _payload(exactly_max)).status_code == 200
    assert _stored(settings, image_id)[0] == 1


def test_invalid_top_level_fields_are_rejected(client: TestClient) -> None:
    project_id, image_id, car = _setup(client)

    extra = _payload([_box(car, 0.1, 0.1, 0.2, 0.2)]) | {"owner": "me"}
    assert _put(client, project_id, image_id, extra).status_code == 422

    negative = _payload([_box(car, 0.1, 0.1, 0.2, 0.2)], base=-1)
    assert _put(client, project_id, image_id, negative).status_code == 422

    assert _put(client, project_id, image_id, {"base_version": 0}).status_code == 422


def test_foreign_box_id_and_foreign_class_leave_version_and_rows_unchanged(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    second = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", ("b.png", make_image_bytes("PNG", (50, 40)), "image/png"))],
        headers=XHR,
    ).json()["results"][0]["image"]["id"]
    other_project = client.post("/api/projects", json={"name": "Other", "task_type": "detect"})
    foreign_class = _add_class(client, other_project.json()["id"], "plane")
    owned = _box(car, 0.1, 0.1, 0.2, 0.2)
    assert _put(client, project_id, image_id, _payload([owned])).status_code == 200

    reused = _put(client, project_id, second, _payload([owned]))
    assert reused.status_code == 422
    assert reused.json() == {"detail": "A box id is already used by another image."}

    wrong = _box(foreign_class, 0.1, 0.1, 0.2, 0.2)
    wrong_class = _put(client, project_id, second, _payload([wrong]))
    assert wrong_class.status_code == 422
    assert wrong_class.json() == {"detail": "Unknown class."}

    assert _stored(settings, second) == (0, [])
    assert _stored(settings, image_id)[0] == 1


def test_background_image_lifecycle(client: TestClient) -> None:
    project_id, image_id, car = _setup(client)

    marked = _put(client, project_id, image_id, _payload([], is_background=True))
    assert marked.status_code == 200
    assert marked.json() == {
        "version": 1,
        "box_count": 0,
        "status": "annotated",
        "is_background": True,
        "is_reviewed": False,
    }

    one_box = _payload([_box(car, 0.1, 0.1, 0.2, 0.2)], base=1)
    cleared = _put(client, project_id, image_id, one_box)
    assert cleared.status_code == 200
    assert cleared.json()["is_background"] is False
    assert cleared.json()["box_count"] == 1

    back = _put(client, project_id, image_id, _payload([], base=2, is_background=True))
    assert back.status_code == 200
    reviewed = _payload([], base=3, is_background=True, is_reviewed=True)
    done = _put(client, project_id, image_id, reviewed)
    assert done.status_code == 200
    assert done.json()["status"] == "reviewed"
    loaded = client.get(_annotations_url(project_id, image_id)).json()
    assert (loaded["is_background"], loaded["is_reviewed"], loaded["boxes"]) == (True, True, [])


def test_invalid_background_with_boxes_is_rejected_and_nothing_changes(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    assert _put(client, project_id, image_id, _payload([], is_background=True)).status_code == 200
    before = _stored(settings, image_id)

    both = _payload([_box(car, 0.1, 0.1, 0.2, 0.2)], base=1, is_background=True)
    response = _put(client, project_id, image_id, both)

    assert response.status_code == 422
    assert "A background image cannot have boxes." in response.json()["detail"]
    assert _stored(settings, image_id) == before


def test_invalid_reviewed_without_boxes_or_background_is_rejected(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, _ = _setup(client)
    before = _stored(settings, image_id)

    response = _put(client, project_id, image_id, _payload([], is_reviewed=True))

    assert response.status_code == 422
    assert "Only an annotated image can be marked as reviewed." in response.json()["detail"]
    assert _stored(settings, image_id) == before


def test_save_without_the_header_stores_nothing(client: TestClient, settings: Settings) -> None:
    project_id, image_id, car = _setup(client)
    body = _payload([_box(car, 0.1, 0.1, 0.2, 0.2)])

    response = _put(client, project_id, image_id, body, {})

    assert response.status_code == 403
    assert response.json() == {"detail": "Missing required request header."}
    assert _stored(settings, image_id) == (0, [])


def test_unknown_project_and_foreign_image_are_404(client: TestClient, settings: Settings) -> None:
    project_id, image_id, car = _setup(client)
    other = client.post("/api/projects", json={"name": "Other", "task_type": "detect"}).json()["id"]
    body = _payload([_box(car, 0.1, 0.1, 0.2, 0.2)])

    foreign_image = _put(client, other, image_id, body)
    assert foreign_image.status_code == 404
    assert foreign_image.json() == {"detail": "Image not found."}

    unknown_project = _put(client, 999999, image_id, body)
    assert unknown_project.status_code == 404
    assert unknown_project.json() == {"detail": "Project not found."}

    unknown_image = _put(client, project_id, 999999, body)
    assert unknown_image.status_code == 404
    assert unknown_image.json() == {"detail": "Image not found."}
    assert _stored(settings, image_id) == (0, [])


def test_boxes_save_and_load_the_same_way_in_a_segment_project(client: TestClient) -> None:
    project_id, image_id, car = _setup(client, task_type="segment")
    project = client.get(f"/api/projects/{project_id}").json()
    assert project["task_type"] == "segment"
    boxes = [_box(car, 0.1, 0.1, 0.4, 0.4), _box(car, 0.5, 0.5, 0.5, 0.5)]

    saved = _put(client, project_id, image_id, _payload(boxes))

    assert saved.status_code == 200
    assert saved.json()["box_count"] == 2
    loaded = client.get(_annotations_url(project_id, image_id)).json()
    assert loaded["boxes"] == boxes
    assert loaded["status"] == "annotated"


def test_an_uploaded_image_starts_with_no_boxes_and_unannotated(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"name": "Fresh", "task_type": "detect"}).json()[
        "id"
    ]

    uploaded = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", ("a.png", make_image_bytes("PNG"), "image/png"))],
        headers=XHR,
    ).json()["results"][0]["image"]

    assert uploaded["box_count"] == 0
    assert uploaded["status"] == "unannotated"
    assert uploaded["is_background"] is False
    assert uploaded["is_reviewed"] is False
    loaded = client.get(_annotations_url(project_id, uploaded["id"])).json()
    assert loaded == {
        "version": 0,
        "is_background": False,
        "is_reviewed": False,
        "status": "unannotated",
        "boxes": [],
    }
    assert json.dumps(loaded)  # plain JSON, nothing exotic
