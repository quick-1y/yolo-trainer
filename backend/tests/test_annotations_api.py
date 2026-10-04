"""API tests for the annotation save contract: CAS version, replace-set, derived status."""

from __future__ import annotations

from fastapi.testclient import TestClient

from .imaging import make_image_bytes

XHR = {"X-Requested-With": "yolo-trainer"}
BOX_A = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f"
BOX_B = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d"


def _setup(client: TestClient) -> tuple[int, int, int]:
    project_id = client.post("/api/projects", json={"name": "Boxes", "task_type": "detect"}).json()[
        "id"
    ]
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
