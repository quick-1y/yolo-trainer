"""Contract tests for POST /api/projects/{id}/images/split (DATA-05; D-01, D-02).

Real app, real SQLite file. The route is a manual assignment only: it writes `split`
and nothing else, stays inside the project, and is CSRF-guarded (T4-03-01..04).
"""

from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings

from .training_helpers import XHR, set_split, setup_project


def _rows(settings: Settings, image_ids: list[int]) -> dict[int, tuple]:
    """(split, annotation_version, is_reviewed, is_background) per image id, read raw."""
    marks = ",".join("?" for _ in image_ids)
    connection = sqlite3.connect(settings.db_path)
    try:
        found = connection.execute(
            "SELECT id, split, annotation_version, is_reviewed, is_background "
            f"FROM images WHERE id IN ({marks})",
            image_ids,
        ).fetchall()
    finally:
        connection.close()
    return {row[0]: row[1:] for row in found}


def _mark_reviewed(client: TestClient, project_id: int, image_id: int) -> None:
    """Put the image into the reviewed state through the annotation route."""
    current = client.get(f"/api/projects/{project_id}/images/{image_id}/annotations").json()
    response = client.put(
        f"/api/projects/{project_id}/images/{image_id}/annotations",
        json={
            "base_version": current["version"],
            "is_background": current["is_background"],
            "is_reviewed": True,
            "boxes": current["boxes"],
        },
        headers=XHR,
    )
    assert response.status_code == 200, response.text


def test_a_bulk_update_sets_the_split_and_reports_how_many_images_changed(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "bulk", unassigned=4)
    chosen = project["unassigned"][:3]

    response = set_split(client, project["project_id"], chosen, "train")

    assert response.status_code == 200
    assert response.json() == {"updated": 3}
    rows = _rows(settings, project["unassigned"])
    assert [rows[image_id][0] for image_id in chosen] == ["train", "train", "train"]
    assert rows[project["unassigned"][3]][0] is None


def test_a_single_image_can_be_updated(client: TestClient, settings: Settings) -> None:
    project = setup_project(client, "single", unassigned=2)
    target = project["unassigned"][1]

    response = set_split(client, project["project_id"], [target], "valid")

    assert response.json() == {"updated": 1}
    rows = _rows(settings, project["unassigned"])
    assert rows[target][0] == "valid"
    assert rows[project["unassigned"][0]][0] is None


def test_null_returns_an_image_to_unassigned(client: TestClient, settings: Settings) -> None:
    project = setup_project(client, "unassign", train=2)

    response = set_split(client, project["project_id"], [project["train"][0]], None)

    assert response.status_code == 200
    assert response.json() == {"updated": 1}
    rows = _rows(settings, project["train"])
    assert rows[project["train"][0]][0] is None
    assert rows[project["train"][1]][0] == "train"


def test_changing_a_split_never_touches_annotation_state(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "untouched", train=1, background=1, unassigned=1)
    reviewed = project["train"][0]
    _mark_reviewed(client, project["project_id"], reviewed)
    ids = [reviewed, project["background"][0], project["unassigned"][0]]
    before = _rows(settings, ids)
    assert before[reviewed][2] == 1  # reviewed
    assert before[project["background"][0]][3] == 1  # background

    response = set_split(client, project["project_id"], ids, "test")

    assert response.json() == {"updated": 3}
    after = _rows(settings, ids)
    for image_id in ids:
        assert after[image_id][0] == "test"
        # annotation_version, is_reviewed and is_background are exactly as before
        assert after[image_id][1:] == before[image_id][1:]


def test_ids_of_another_project_are_left_alone(client: TestClient, settings: Settings) -> None:
    mine = setup_project(client, "mine", unassigned=1)
    other = setup_project(client, "other", train=1)

    response = set_split(
        client, mine["project_id"], [mine["unassigned"][0], other["train"][0]], "valid"
    )

    assert response.status_code == 200
    assert response.json() == {"updated": 1}
    rows = _rows(settings, [mine["unassigned"][0], other["train"][0]])
    assert rows[mine["unassigned"][0]][0] == "valid"
    assert rows[other["train"][0]][0] == "train"


def test_repeating_the_same_request_matches_the_same_rows(client: TestClient) -> None:
    project = setup_project(client, "repeat", unassigned=3)

    first = set_split(client, project["project_id"], project["unassigned"], "train")
    second = set_split(client, project["project_id"], project["unassigned"], "train")

    assert first.json() == {"updated": 3}
    assert second.json() == {"updated": 3}


def test_an_empty_id_list_is_rejected(client: TestClient) -> None:
    project = setup_project(client, "empty")

    response = set_split(client, project["project_id"], [], "train")

    assert response.status_code == 422


def test_more_than_a_thousand_ids_are_rejected(client: TestClient) -> None:
    project = setup_project(client, "too-many")

    response = set_split(client, project["project_id"], list(range(1, 1002)), "train")

    assert response.status_code == 422


def test_exactly_a_thousand_ids_are_accepted(client: TestClient) -> None:
    project = setup_project(client, "limit")

    response = set_split(client, project["project_id"], list(range(1, 1001)), "train")

    assert response.status_code == 200
    assert response.json() == {"updated": 0}


def test_omitting_the_split_key_is_rejected_unlike_an_explicit_null(client: TestClient) -> None:
    project = setup_project(client, "no-key", unassigned=1)

    response = client.post(
        f"/api/projects/{project['project_id']}/images/split",
        json={"ids": project["unassigned"]},
        headers=XHR,
    )

    assert response.status_code == 422


def test_an_unknown_split_value_is_rejected(client: TestClient) -> None:
    project = setup_project(client, "bad-value", unassigned=1)

    response = set_split(client, project["project_id"], project["unassigned"], "holdout")

    assert response.status_code == 422


def test_a_request_without_the_xhr_header_is_forbidden(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "csrf", unassigned=1)

    response = client.post(
        f"/api/projects/{project['project_id']}/images/split",
        json={"ids": project["unassigned"], "split": "train"},
    )

    assert response.status_code == 403
    assert _rows(settings, project["unassigned"])[project["unassigned"][0]][0] is None


def test_an_unknown_project_is_not_found(client: TestClient) -> None:
    response = set_split(client, 9999, [1], "train")

    assert response.status_code == 404


def test_status_counts_report_the_new_split_totals(client: TestClient) -> None:
    project = setup_project(client, "counts", unassigned=5)

    set_split(client, project["project_id"], project["unassigned"][:3], "train")
    counts = client.get(f"/api/projects/{project['project_id']}/images/status-counts").json()

    assert counts["splits"] == {"train": 3, "valid": 0, "test": 0, "none": 2}
    assert counts["total"] == 5
