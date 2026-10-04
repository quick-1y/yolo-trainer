"""Concurrency and retry behaviour of the versioned annotation save (D-12, Pitfall 1)."""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from yolo_trainer_api.annotations import CONFLICT_DETAIL
from yolo_trainer_api.settings import Settings

from .imaging import make_image_bytes
from .test_annotations_api import (
    XHR,
    _annotations_url,
    _box,
    _payload,
    _put,
    _setup,
    _stored,
)

CONFLICT_TEXT = "These annotations were changed elsewhere. Reload the image to continue."


def _upload(client: TestClient, project_id: int, size: tuple[int, int]) -> int:
    response = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", ("c.png", make_image_bytes("PNG", size), "image/png"))],
        headers=XHR,
    )
    return response.json()["results"][0]["image"]["id"]


def test_conflict_text_is_the_documented_contract() -> None:
    assert CONFLICT_DETAIL == CONFLICT_TEXT


def test_stale_base_with_different_content_conflicts_and_keeps_the_first_save(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    first = _payload([_box(car, 0.1, 0.1, 0.2, 0.2)])
    assert _put(client, project_id, image_id, first).status_code == 200
    stored_before = _stored(settings, image_id)

    second = _put(client, project_id, image_id, _payload([_box(car, 0.5, 0.5, 0.2, 0.2)]))

    assert second.status_code == 409
    assert second.json() == {"detail": CONFLICT_TEXT}
    assert _stored(settings, image_id) == stored_before


def test_same_payload_sent_twice_with_the_same_base_is_applied_once(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    body = _payload([_box(car, 0.1, 0.1, 0.2, 0.2), _box(car, 0.5, 0.5, 0.2, 0.2)])

    first = _put(client, project_id, image_id, body)
    retry = _put(client, project_id, image_id, body)

    assert first.status_code == retry.status_code == 200
    assert first.json() == retry.json()
    assert retry.json()["version"] == 1
    version, rows = _stored(settings, image_id)
    assert version == 1
    assert len(rows) == 2
    assert [row[0] for row in rows] == [box["id"] for box in body["boxes"]]


def test_two_concurrent_saves_with_the_same_base_yield_one_winner(
    client: TestClient, settings: Settings
) -> None:
    project_id, first_image, car = _setup(client)
    images = [
        first_image,
        _upload(client, project_id, (50, 40)),
        _upload(client, project_id, (60, 40)),
    ]

    for image_id in images:
        bodies = [
            _payload([_box(car, 0.1, 0.1, 0.2, 0.2)]),
            _payload([_box(car, 0.6, 0.6, 0.3, 0.3), _box(car, 0.0, 0.0, 0.1, 0.1)]),
        ]
        start = threading.Barrier(2)

        def save(body: dict, image_id: int = image_id, start: threading.Barrier = start) -> tuple:
            start.wait()
            response = _put(client, project_id, image_id, body)
            return response.status_code, response.json()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, bodies))

        assert sorted(status for status, _ in results) == [200, 409], results
        loser = next(body for status, body in results if status == 409)
        assert loser == {"detail": CONFLICT_TEXT}
        winner_body = bodies[[status for status, _ in results].index(200)]
        version, rows = _stored(settings, image_id)
        assert version == 1
        assert [row[0] for row in rows] == [box["id"] for box in winner_body["boxes"]]


def test_failed_save_leaves_version_and_rows_as_they_were(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    kept = _box(car, 0.1, 0.1, 0.2, 0.2)
    assert _put(client, project_id, image_id, _payload([kept])).status_code == 200
    before = _stored(settings, image_id)

    failing = _payload([kept, _box(car + 500, 0.5, 0.5, 0.2, 0.2)], base=1)
    response = _put(client, project_id, image_id, failing)

    assert response.status_code == 422
    assert response.json() == {"detail": "Unknown class."}
    assert _stored(settings, image_id) == before
    # The failed attempt did not burn the version: the next save with base 1 works.
    retried = _put(client, project_id, image_id, _payload([kept], base=1, is_background=False))
    assert retried.status_code == 200
    assert retried.json()["version"] == 2


def test_five_sequential_saves_give_versions_one_to_five(client: TestClient) -> None:
    project_id, image_id, car = _setup(client)
    boxes: list[dict] = []
    versions = []

    for base in range(5):
        boxes = [*boxes, _box(car, 0.05 * base, 0.05 * base, 0.1, 0.1)]
        response = _put(client, project_id, image_id, _payload(boxes, base=base))
        assert response.status_code == 200
        versions.append(response.json()["version"])

    assert versions == [1, 2, 3, 4, 5]
    loaded = client.get(_annotations_url(project_id, image_id)).json()
    assert loaded["version"] == 5
    assert [box["id"] for box in loaded["boxes"]] == [box["id"] for box in boxes]


def test_background_toggle_saved_with_a_stale_base_conflicts(
    client: TestClient, settings: Settings
) -> None:
    project_id, image_id, car = _setup(client)
    assert (
        _put(client, project_id, image_id, _payload([_box(car, 0.1, 0.1, 0.2, 0.2)])).status_code
        == 200
    )
    before = _stored(settings, image_id)

    # A second tab still on version 0 marks the image as background.
    stale_toggle = _put(client, project_id, image_id, _payload([], base=0, is_background=True))

    assert stale_toggle.status_code == 409
    assert stale_toggle.json() == {"detail": CONFLICT_TEXT}
    assert _stored(settings, image_id) == before
    loaded = client.get(_annotations_url(project_id, image_id)).json()
    assert loaded["is_background"] is False
    assert len(loaded["boxes"]) == 1
