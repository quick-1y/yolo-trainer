"""Auto-split of the unassigned images: pure allocation and preview/apply routes (DATA-05, D-03).

The pure part is tested directly; the routes run on the real app and a real SQLite file.
The server only ever applies what was previewed (same seed, same number of unassigned
images) or answers 409 and writes nothing (T4-06-01); it never touches an image that
already has a split.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings

from .training_helpers import XHR, set_split, setup_project

DRIFT = "The set of unassigned images changed. Review the split again."


def _auto_split(ids: list[int], train: int, valid: int, test: int, seed: int) -> dict[int, str]:
    from yolo_trainer_api.splits import auto_split

    return auto_split(ids, train, valid, test, seed)


def _counts(assignment: dict[int, str]) -> dict[str, int]:
    from yolo_trainer_api.splits import split_counts

    return split_counts(assignment)


def _tally(assignment: dict[int, str]) -> tuple[int, int, int]:
    values = list(assignment.values())
    return values.count("train"), values.count("valid"), values.count("test")


# --------------------------------------------------------------------------
# The pure allocation
# --------------------------------------------------------------------------


def test_no_images_give_an_empty_assignment() -> None:
    assert _auto_split([], 80, 10, 10, 1) == {}


@pytest.mark.parametrize(
    ("count", "ratios", "expected"),
    [
        (1, (80, 10, 10), (1, 0, 0)),
        (2, (80, 10, 10), (1, 1, 0)),
        (3, (80, 20, 0), (2, 1, 0)),
        (4, (80, 10, 10), (2, 1, 1)),
        (10, (80, 10, 10), (8, 1, 1)),
        (100, (70, 20, 10), (70, 20, 10)),
        (5, (80, 10, 10), (3, 1, 1)),
        (15, (80, 10, 10), (11, 2, 2)),
        (25, (80, 10, 10), (19, 3, 3)),
    ],
)
def test_the_split_sizes_follow_the_rounding_rules(
    count: int, ratios: tuple[int, int, int], expected: tuple[int, int, int]
) -> None:
    assignment = _auto_split(list(range(1, count + 1)), *ratios, 7)

    assert _tally(assignment) == expected
    assert sorted(assignment) == list(range(1, count + 1))


def test_train_keeps_an_image_when_test_and_valid_would_take_them_all() -> None:
    assignment = _auto_split([5, 9], 10, 10, 80, 3)

    assert _tally(assignment) == (1, 1, 0)


def test_every_size_keeps_at_least_one_train_image_and_adds_up() -> None:
    for count in range(1, 60):
        for ratios in ((80, 10, 10), (50, 25, 25), (90, 10, 0), (10, 10, 80), (1, 98, 1)):
            assignment = _auto_split(list(range(count)), *ratios, 11)
            train, valid, test = _tally(assignment)
            assert train >= 1
            assert train + valid + test == count


def test_the_same_inputs_always_give_the_same_assignment() -> None:
    ids = list(range(1, 41))

    assert _auto_split(ids, 80, 10, 10, 42) == _auto_split(ids, 80, 10, 10, 42)


def test_a_different_seed_gives_a_different_assignment() -> None:
    ids = list(range(1, 21))

    assert _auto_split(ids, 80, 10, 10, 1) != _auto_split(ids, 80, 10, 10, 2)


def test_the_input_order_of_the_ids_does_not_matter() -> None:
    ids = list(range(1, 31))

    assert _auto_split(ids, 70, 20, 10, 5) == _auto_split(list(reversed(ids)), 70, 20, 10, 5)


def test_counts_always_list_all_three_splits() -> None:
    assert _counts({}) == {"train": 0, "valid": 0, "test": 0}
    assert _counts({1: "train", 2: "train", 3: "valid"}) == {"train": 2, "valid": 1, "test": 0}


# --------------------------------------------------------------------------
# Helpers for the routes
# --------------------------------------------------------------------------


def _base(project_id: int) -> str:
    return f"/api/projects/{project_id}/splits/auto"


def _preview(
    client: TestClient,
    project_id: int,
    train: int = 80,
    valid: int = 10,
    test: int = 10,
    seed: int | None = None,
    headers: dict[str, str] | None = XHR,
):
    body: dict = {"train": train, "valid": valid, "test": test}
    if seed is not None:
        body["seed"] = seed
    return client.post(f"{_base(project_id)}/preview", json=body, headers=headers)


def _apply(
    client: TestClient,
    project_id: int,
    seed: int,
    expected_unassigned: int,
    train: int = 80,
    valid: int = 10,
    test: int = 10,
    headers: dict[str, str] | None = XHR,
):
    return client.post(
        _base(project_id),
        json={
            "train": train,
            "valid": valid,
            "test": test,
            "seed": seed,
            "expected_unassigned": expected_unassigned,
        },
        headers=headers,
    )


def _state(settings: Settings, project_id: int) -> dict[int, tuple]:
    """(split, annotation_version, is_reviewed, is_background) per image id, read raw."""
    connection = sqlite3.connect(settings.db_path)
    try:
        found = connection.execute(
            "SELECT id, split, annotation_version, is_reviewed, is_background "
            "FROM images WHERE project_id = ?",
            (project_id,),
        ).fetchall()
    finally:
        connection.close()
    return {row[0]: row[1:] for row in found}


def _mixed_project(client: TestClient, name: str) -> dict:
    """5 unassigned images (2 never annotated, 3 annotated) and 3 manually assigned ones."""
    project = setup_project(client, name, train=6, unannotated=0, unassigned=2)
    handed_back = project["train"][:3]
    assert set_split(client, project["project_id"], handed_back, None).status_code == 200
    project["manual"] = project["train"][3:]
    project["pool"] = project["unassigned"] + handed_back
    return project


# --------------------------------------------------------------------------
# Preview
# --------------------------------------------------------------------------


def test_the_preview_counts_the_unassigned_images_and_changes_nothing(
    client: TestClient, settings: Settings
) -> None:
    project = _mixed_project(client, "preview")
    before = _state(settings, project["project_id"])

    response = _preview(client, project["project_id"])

    assert response.status_code == 200
    body = response.json()
    assert body["unassigned_total"] == 5
    assert body["counts"] == {"train": 3, "valid": 1, "test": 1}
    assert isinstance(body["seed"], int)
    assert 0 <= body["seed"] < 2**31
    assert _state(settings, project["project_id"]) == before


def test_a_given_seed_is_echoed_and_gives_the_same_counts_each_time(client: TestClient) -> None:
    project = setup_project(client, "echo", unassigned=12)

    first = _preview(client, project["project_id"], seed=1234).json()
    second = _preview(client, project["project_id"], seed=1234).json()

    assert first["seed"] == 1234
    assert first == second


def test_seed_zero_is_a_real_seed(client: TestClient) -> None:
    project = setup_project(client, "zero", unassigned=3)

    assert _preview(client, project["project_id"], seed=0).json()["seed"] == 0


def test_a_project_without_unassigned_images_previews_zero(client: TestClient) -> None:
    project = setup_project(client, "assigned", train=2)

    body = _preview(client, project["project_id"]).json()

    assert body["unassigned_total"] == 0
    assert body["counts"] == {"train": 0, "valid": 0, "test": 0}


def test_test_at_zero_is_a_valid_ratio(client: TestClient) -> None:
    project = setup_project(client, "no-test", unassigned=10)

    response = _preview(client, project["project_id"], train=90, valid=10, test=0)

    assert response.status_code == 200
    assert response.json()["counts"] == {"train": 9, "valid": 1, "test": 0}


# --------------------------------------------------------------------------
# Apply
# --------------------------------------------------------------------------


def test_apply_writes_exactly_the_previewed_counts_to_the_unassigned_images_only(
    client: TestClient, settings: Settings
) -> None:
    project = _mixed_project(client, "apply")
    before = _state(settings, project["project_id"])
    preview = _preview(client, project["project_id"]).json()

    response = _apply(client, project["project_id"], preview["seed"], preview["unassigned_total"])

    assert response.status_code == 200
    assert response.json() == {"counts": preview["counts"]}
    after = _state(settings, project["project_id"])
    pool_splits = [after[image_id][0] for image_id in project["pool"]]
    assert pool_splits.count("train") == preview["counts"]["train"]
    assert pool_splits.count("valid") == preview["counts"]["valid"]
    assert pool_splits.count("test") == preview["counts"]["test"]
    for image_id in project["manual"]:
        assert after[image_id][0] == "train"
    # only the split column changed: annotation_version, reviewed and background are as before
    for image_id, row in before.items():
        assert after[image_id][1:] == row[1:]


def test_the_applied_assignment_is_the_one_the_pure_function_gives(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "same-as-pure", unassigned=20)
    ids = project["unassigned"]
    preview = _preview(client, project["project_id"], seed=99).json()

    _apply(client, project["project_id"], 99, preview["unassigned_total"])

    after = _state(settings, project["project_id"])
    assert {image_id: after[image_id][0] for image_id in ids} == _auto_split(ids, 80, 10, 10, 99)


def test_apply_with_a_stale_count_after_a_manual_assignment_is_a_conflict_and_changes_nothing(
    client: TestClient, settings: Settings
) -> None:
    project = _mixed_project(client, "drift-manual")
    preview = _preview(client, project["project_id"]).json()
    set_split(client, project["project_id"], [project["pool"][0]], "valid")
    before = _state(settings, project["project_id"])

    response = _apply(client, project["project_id"], preview["seed"], preview["unassigned_total"])

    assert response.status_code == 409
    assert response.json() == {"detail": DRIFT}
    assert _state(settings, project["project_id"]) == before


def test_apply_after_a_new_upload_is_a_conflict(client: TestClient, settings: Settings) -> None:
    from .training_helpers import _upload, box_png

    project = setup_project(client, "drift-upload", unassigned=4)
    preview = _preview(client, project["project_id"]).json()
    _upload(client, project["project_id"], box_png((10, 20, 30), (20, 20, 60, 60)))
    before = _state(settings, project["project_id"])

    response = _apply(client, project["project_id"], preview["seed"], preview["unassigned_total"])

    assert response.status_code == 409
    assert response.json() == {"detail": DRIFT}
    assert _state(settings, project["project_id"]) == before


def test_applying_twice_is_refused_the_second_time(client: TestClient) -> None:
    project = setup_project(client, "twice", unassigned=6)
    preview = _preview(client, project["project_id"]).json()

    first = _apply(client, project["project_id"], preview["seed"], preview["unassigned_total"])
    second = _apply(client, project["project_id"], preview["seed"], preview["unassigned_total"])

    assert first.status_code == 200
    assert second.status_code == 409


def test_a_row_taken_between_the_read_and_the_write_rolls_the_whole_apply_back(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from yolo_trainer_api import splits as pure

    project = setup_project(client, "race", unassigned=10)
    preview = _preview(client, project["project_id"], seed=5).json()

    def drifting(ids, train, valid, test, seed):  # noqa: ANN001, ANN202
        assignment = pure.auto_split(ids, train, valid, test, seed)
        victim = next(image_id for image_id, split in assignment.items() if split == "test")
        connection = sqlite3.connect(settings.db_path)
        try:
            connection.execute("UPDATE images SET split = 'train' WHERE id = ?", (victim,))
            connection.commit()
        finally:
            connection.close()
        return assignment

    monkeypatch.setattr("yolo_trainer_api.routers.splits.auto_split", drifting)

    response = _apply(client, project["project_id"], 5, preview["unassigned_total"])

    assert response.status_code == 409
    assert response.json() == {"detail": DRIFT}
    splits = [row[0] for row in _state(settings, project["project_id"]).values()]
    # only the image taken by hand has a split: the earlier train and valid writes were undone
    assert splits.count(None) == 9
    assert splits.count("train") == 1


def test_a_large_set_is_written_across_several_statements(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "large")
    connection = sqlite3.connect(settings.db_path)
    try:
        connection.executemany(
            "INSERT INTO images (project_id, original_filename, filename_key, ext, sha256, "
            "size_bytes, width, height, created_at) VALUES (?, ?, ?, 'png', ?, 1, 8, 8, "
            "'2026-01-01 00:00:00.000000')",
            [(project["project_id"], f"a{i}.png", f"a{i}.png", f"{i:064x}") for i in range(1200)],
        )
        connection.commit()
    finally:
        connection.close()
    preview = _preview(client, project["project_id"], seed=8).json()

    response = _apply(client, project["project_id"], 8, preview["unassigned_total"])

    assert preview["unassigned_total"] == 1200
    assert response.status_code == 200
    assert response.json()["counts"] == {"train": 960, "valid": 120, "test": 120}
    splits = [row[0] for row in _state(settings, project["project_id"]).values()]
    assert (splits.count("train"), splits.count("valid"), splits.count("test")) == (960, 120, 120)
    assert None not in splits


def test_another_projects_images_are_never_touched(client: TestClient, settings: Settings) -> None:
    mine = setup_project(client, "mine", unassigned=5)
    other = setup_project(client, "other", unassigned=5)
    preview = _preview(client, mine["project_id"]).json()

    _apply(client, mine["project_id"], preview["seed"], preview["unassigned_total"])

    assert {row[0] for row in _state(settings, other["project_id"]).values()} == {None}


# --------------------------------------------------------------------------
# Validation, CSRF, unknown project
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ratios", "message"),
    [
        ((80, 10, 9), "Ratios must add up to 100."),
        ((80, 11, 10), "Ratios must add up to 100."),
        ((0, 90, 10), "Train and Valid must be above 0."),
        ((90, 0, 10), "Train and Valid must be above 0."),
        ((100, 0, 0), "Train and Valid must be above 0."),
    ],
)
def test_ratios_that_do_not_work_are_rejected_with_a_plain_message(
    client: TestClient, ratios: tuple[int, int, int], message: str
) -> None:
    project = setup_project(client, "bad-ratios", unassigned=3)
    train, valid, test = ratios

    preview = _preview(client, project["project_id"], train, valid, test)
    apply = _apply(client, project["project_id"], 1, 3, train, valid, test)

    assert preview.status_code == 422
    assert preview.json() == {"detail": message}
    assert apply.status_code == 422
    assert apply.json() == {"detail": message}


@pytest.mark.parametrize("bad", [-1, 101, 80.5, "80", True, None])
def test_a_negative_oversized_or_non_integer_ratio_is_rejected(
    client: TestClient, bad: object
) -> None:
    project = setup_project(client, "odd-values", unassigned=3)

    response = client.post(
        f"{_base(project['project_id'])}/preview",
        json={"train": bad, "valid": 10, "test": 10},
        headers=XHR,
    )

    assert response.status_code == 422


def test_apply_requires_its_seed_and_expected_count_and_refuses_extra_fields(
    client: TestClient,
) -> None:
    project = setup_project(client, "shape", unassigned=3)
    url = _base(project["project_id"])
    base = {"train": 80, "valid": 10, "test": 10}

    no_seed = client.post(url, json={**base, "expected_unassigned": 3}, headers=XHR)
    no_count = client.post(url, json={**base, "seed": 1}, headers=XHR)
    negative = client.post(url, json={**base, "seed": 1, "expected_unassigned": -1}, headers=XHR)
    extra = client.post(
        url, json={**base, "seed": 1, "expected_unassigned": 3, "split": "train"}, headers=XHR
    )
    huge_seed = client.post(
        url, json={**base, "seed": 2**31, "expected_unassigned": 3}, headers=XHR
    )

    for response in (no_seed, no_count, negative, extra, huge_seed):
        assert response.status_code == 422


@pytest.mark.parametrize("route", ["/preview", ""])
def test_a_request_without_the_xhr_header_is_forbidden_and_changes_nothing(
    client: TestClient, settings: Settings, route: str
) -> None:
    project = setup_project(client, "csrf", unassigned=4)
    body = {"train": 80, "valid": 10, "test": 10, "seed": 1, "expected_unassigned": 4}

    response = client.post(f"{_base(project['project_id'])}{route}", json=body)

    assert response.status_code == 403
    assert {row[0] for row in _state(settings, project["project_id"]).values()} == {None}


def test_an_unknown_project_is_not_found_on_both_routes(client: TestClient) -> None:
    assert _preview(client, 9999).status_code == 404
    assert _apply(client, 9999, 1, 0).status_code == 404
