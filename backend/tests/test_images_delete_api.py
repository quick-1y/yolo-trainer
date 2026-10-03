"""Contract tests for deleting images (ANNO-01, DATA-01; D-11, D-19, T2-11-01/02/05).

Real app, real SQLite file, real files on disk - nothing is mocked except the
one failure-injection test for `remove_image_files`.
"""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

from yolo_trainer_api import storage
from yolo_trainer_api.settings import Settings

from .test_images_api import create_project, make_png, upload


def _add(client: TestClient, project_id: int, name: str, color: int) -> int:
    data = make_png((32 + color, 32), (color, 10, 10))
    response = upload(client, project_id, [(name, data, "image/png")])
    return response.json()["results"][0]["image"]["id"]


def _delete(client: TestClient, project_id: int, payload: object):
    return client.post(f"/api/projects/{project_id}/images/delete", json=payload)


def _exists(settings: Settings, project_id: int, image_id: int) -> tuple[bool, bool]:
    return (
        storage.image_path(settings, project_id, image_id, "png").exists(),
        storage.thumb_path(settings, project_id, image_id).exists(),
    )


def test_delete_removes_rows_and_both_files_of_the_chosen_images(
    client: TestClient, settings: Settings
) -> None:
    project_id = create_project(client)
    first = _add(client, project_id, "a.png", 10)
    second = _add(client, project_id, "b.png", 20)
    third = _add(client, project_id, "c.png", 30)

    response = _delete(client, project_id, {"ids": [first, second]})

    assert response.status_code == 200
    assert response.json() == {"deleted": 2}
    page = client.get(f"/api/projects/{project_id}/images").json()
    assert page["total"] == 1
    assert [item["id"] for item in page["items"]] == [third]
    assert _exists(settings, project_id, first) == (False, False)
    assert _exists(settings, project_id, second) == (False, False)
    assert _exists(settings, project_id, third) == (True, True)


def test_repeating_the_same_delete_is_a_no_op(client: TestClient) -> None:
    project_id = create_project(client)
    image_id = _add(client, project_id, "a.png", 10)

    assert _delete(client, project_id, {"ids": [image_id]}).json() == {"deleted": 1}
    again = _delete(client, project_id, {"ids": [image_id]})

    assert again.status_code == 200
    assert again.json() == {"deleted": 0}


def test_duplicate_ids_in_one_request_count_once(client: TestClient) -> None:
    project_id = create_project(client)
    image_id = _add(client, project_id, "a.png", 10)

    response = _delete(client, project_id, {"ids": [image_id, image_id, image_id]})

    assert response.json() == {"deleted": 1}


def test_ids_of_another_project_are_ignored(client: TestClient, settings: Settings) -> None:
    owner = create_project(client, "Owner")
    other = create_project(client, "Other")
    foreign = _add(client, owner, "a.png", 10)

    response = _delete(client, other, {"ids": [foreign]})

    assert response.status_code == 200
    assert response.json() == {"deleted": 0}
    assert client.get(f"/api/projects/{owner}/images").json()["total"] == 1
    assert _exists(settings, owner, foreign) == (True, True)


@pytest.mark.parametrize(
    "payload",
    [
        {"ids": []},
        {"ids": list(range(1, 1002))},
        {"ids": [1], "extra": True},
        {"ids": ["x"]},
        {},
    ],
    ids=["empty", "too-many", "extra-field", "non-integer", "missing"],
)
def test_invalid_bodies_are_rejected_with_422(client: TestClient, payload: object) -> None:
    project_id = create_project(client)

    assert _delete(client, project_id, payload).status_code == 422


def test_exactly_1000_ids_are_accepted(client: TestClient) -> None:
    project_id = create_project(client)

    response = _delete(client, project_id, {"ids": list(range(1, 1001))})

    assert response.status_code == 200
    assert response.json() == {"deleted": 0}


def test_unknown_project_is_404(client: TestClient) -> None:
    response = _delete(client, 9999, {"ids": [1]})

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found."}


def test_ids_are_never_reused_after_deleting_the_newest_image(client: TestClient) -> None:
    project_id = create_project(client)
    _add(client, project_id, "a.png", 10)
    newest = _add(client, project_id, "b.png", 20)

    assert _delete(client, project_id, {"ids": [newest]}).json() == {"deleted": 1}
    replacement = _add(client, project_id, "c.png", 30)

    assert replacement > newest


def test_a_failing_file_removal_still_succeeds_and_is_logged(
    client: TestClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    project_id = create_project(client)
    image_id = _add(client, project_id, "a.png", 10)

    def fail(*args: object, **kwargs: object) -> None:
        raise OSError("locked by another process")

    monkeypatch.setattr(storage, "remove_image_files", fail)
    with caplog.at_level(logging.ERROR):
        response = _delete(client, project_id, {"ids": [image_id]})

    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert client.get(f"/api/projects/{project_id}/images").json()["total"] == 0
    assert any(str(image_id) in record.getMessage() for record in caplog.records)
    assert _exists(settings, project_id, image_id) == (True, True)
