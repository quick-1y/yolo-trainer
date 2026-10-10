"""GET /api/projects/{id}/training/options and the device check on run creation (D-07, D-09)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common.layout import heartbeat_file, write_json_atomic

from .training_helpers import XHR, post_run, seed_model, setup_project, start_run


def write_heartbeat(settings: Settings, *, age_seconds: int = 0, cuda: bool = True) -> None:
    last = datetime.now(UTC) - timedelta(seconds=age_seconds)
    write_json_atomic(
        heartbeat_file(settings.data_dir),
        {
            "pid": 1,
            "started_at": last.isoformat().replace("+00:00", "Z"),
            "last_heartbeat": last.isoformat().replace("+00:00", "Z"),
            "torch_version": "2.14.0",
            "ultralytics_version": "8.4.159",
            "cuda_available": cuda,
            "device": "cuda:0" if cuda else "cpu",
            "device_name": "RTX 4090" if cuda else "CPU",
        },
    )


def options(client: TestClient, project_id: int):
    return client.get(f"/api/projects/{project_id}/training/options")


def test_a_detect_project_lists_the_ten_official_models_with_the_standard_defaults(
    client: TestClient,
) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)

    response = options(client, project["project_id"])

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["task_type"] == "detect"
    assert len(body["official"]) == 10
    assert body["official"][0] == {"name": "yolo26n", "size": "n"}
    assert body["official"][-1] == {"name": "yolo11x", "size": "x"}
    assert body["default_base"] == "yolo26n"
    assert body["defaults"] == {"epochs": 100, "imgsz": 640, "batch": -1, "device": "auto"}
    assert body["next_run_name"] == "run-1"


def test_the_next_run_name_follows_the_existing_runs(client: TestClient) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)
    start_run(client, project["project_id"])

    assert options(client, project["project_id"]).json()["next_run_name"] == "run-2"


def test_a_segment_project_lists_only_seg_models(client: TestClient) -> None:
    project = setup_project(client, "Masks", task_type="segment", train=1, valid=1)

    body = options(client, project["project_id"]).json()

    assert body["task_type"] == "segment"
    assert [entry["name"] for entry in body["official"]][:2] == ["yolo26n-seg", "yolo26s-seg"]
    assert all(entry["name"].endswith("-seg") for entry in body["official"])
    assert body["default_base"] == "yolo26n-seg"


def test_an_unknown_project_is_404(client: TestClient) -> None:
    assert options(client, 999).status_code == 404


def test_without_a_heartbeat_there_is_no_gpu(client: TestClient) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)

    devices = options(client, project["project_id"]).json()["devices"]

    assert devices == {"gpus": [], "worker_fresh": False}


def test_a_fresh_cuda_heartbeat_offers_one_gpu(client: TestClient, settings: Settings) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)
    write_heartbeat(settings)

    devices = options(client, project["project_id"]).json()["devices"]

    assert devices == {"gpus": [{"index": 0, "name": "RTX 4090"}], "worker_fresh": True}


def test_a_fresh_cpu_only_heartbeat_offers_no_gpu(client: TestClient, settings: Settings) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)
    write_heartbeat(settings, cuda=False)

    devices = options(client, project["project_id"]).json()["devices"]

    assert devices == {"gpus": [], "worker_fresh": True}


def test_a_stale_heartbeat_offers_no_gpu(client: TestClient, settings: Settings) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)
    write_heartbeat(settings, age_seconds=120)

    devices = options(client, project["project_id"]).json()["devices"]

    assert devices == {"gpus": [], "worker_fresh": False}


def test_a_gpu_run_is_refused_without_a_fresh_cuda_heartbeat(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)

    refused = post_run(client, project["project_id"], device="0")
    assert refused.status_code == 422
    assert refused.json()["detail"] == "No GPU is available."

    write_heartbeat(settings, age_seconds=120)
    assert post_run(client, project["project_id"], device="0").status_code == 422

    write_heartbeat(settings, cuda=False)
    assert post_run(client, project["project_id"], device="0").status_code == 422


def test_a_gpu_run_starts_when_the_worker_reports_cuda(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)
    write_heartbeat(settings)

    response = post_run(client, project["project_id"], device="0")

    assert response.status_code == 201, response.text
    assert response.json()["settings"]["device"] == "0"


def test_a_cpu_run_needs_no_heartbeat(client: TestClient) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)

    assert post_run(client, project["project_id"], device="cpu").status_code == 201


# --------------------------------------------------------------------------
# Dataset summary, blockers and warnings (D-04, D-05, D-06)
# --------------------------------------------------------------------------


def codes(notes: list[dict]) -> list[str]:
    return [item["code"] for item in notes]


def note(notes: list[dict], code: str) -> dict:
    return next(item for item in notes if item["code"] == code)


def test_the_summary_counts_usable_and_unannotated_images_per_split(client: TestClient) -> None:
    project = setup_project(
        client,
        "Plates",
        train=3,
        background=1,
        unannotated=2,
        valid=1,
        unassigned=4,
        classes=("car", "plate"),
    )

    body = options(client, project["project_id"]).json()

    assert body["summary"] == {
        "train": {"used": 4, "unannotated": 2},
        "valid": {"used": 1, "unannotated": 0},
        "test": {"used": 0, "unannotated": 0},
        "unassigned": 4,
        "class_count": 2,
    }
    assert body["blockers"] == []
    assert note(body["warnings"], "unannotated")["count"] == 2
    assert note(body["warnings"], "unassigned")["count"] == 4


def test_a_healthy_project_has_no_blockers_and_an_empty_test_split_is_fine(
    client: TestClient,
) -> None:
    project = setup_project(client, "Plates", train=2, valid=1)

    body = options(client, project["project_id"]).json()

    assert body["blockers"] == []
    assert body["summary"]["test"] == {"used": 0, "unannotated": 0}
    assert body["models"] == []
    assert codes(body["warnings"]) == ["workerStale"]  # no heartbeat in the test data dir


def test_a_project_without_classes_is_blocked_and_the_run_is_refused(client: TestClient) -> None:
    project = setup_project(client, "NoClasses", classes=())

    body = options(client, project["project_id"]).json()
    refused = post_run(client, project["project_id"])

    assert body["blockers"][0] == {"code": "noClasses", "count": 0, "names": []}
    assert body["summary"]["class_count"] == 0
    assert refused.status_code == 422
    assert refused.json()["detail"] == service.NO_CLASSES_DETAIL


def test_a_train_split_with_only_unannotated_images_is_blocked(client: TestClient) -> None:
    project = setup_project(client, "OnlyEmpty", unannotated=2, valid=1)

    body = options(client, project["project_id"]).json()
    refused = post_run(client, project["project_id"])

    assert codes(body["blockers"]) == ["trainEmpty"]
    assert body["summary"]["train"] == {"used": 0, "unannotated": 2}
    assert refused.status_code == 422
    assert refused.json()["detail"] == service.TRAIN_EMPTY_DETAIL


def test_an_empty_valid_split_is_blocked(client: TestClient) -> None:
    project = setup_project(client, "NoValid", train=1)

    body = options(client, project["project_id"]).json()
    refused = post_run(client, project["project_id"])

    assert codes(body["blockers"]) == ["validEmpty"]
    assert refused.status_code == 422
    assert refused.json()["detail"] == service.VALID_EMPTY_DETAIL


def test_a_project_with_no_assigned_images_shows_zeros_and_both_blockers(
    client: TestClient,
) -> None:
    project = setup_project(client, "Fresh", unassigned=3)

    body = options(client, project["project_id"]).json()

    assert body["summary"] == {
        "train": {"used": 0, "unannotated": 0},
        "valid": {"used": 0, "unannotated": 0},
        "test": {"used": 0, "unannotated": 0},
        "unassigned": 3,
        "class_count": 1,
    }
    assert codes(body["blockers"]) == ["trainEmpty", "validEmpty"]
    assert note(body["warnings"], "unassigned")["count"] == 3


def test_the_summary_matches_what_the_snapshot_of_a_started_run_uses(client: TestClient) -> None:
    project = setup_project(client, "Same", train=2, background=1, unannotated=1, valid=1, test=1)

    body = options(client, project["project_id"]).json()
    started = start_run(client, project["project_id"])

    used = {split: body["summary"][split]["used"] for split in ("train", "valid", "test")}
    assert used == started["dataset_counts"] == {"train": 3, "valid": 1, "test": 1}
    assert body["summary"]["train"]["unannotated"] == 1


def test_classes_without_examples_in_valid_are_a_warning_not_a_blocker(
    client: TestClient,
) -> None:
    project = setup_project(client, "Plates", train=2, valid=1, classes=("car", "plate"))
    plate = project["class_ids"][1]
    relabeled = client.put(
        f"/api/projects/{project['project_id']}/images/{project['train'][1]}/annotations",
        json={
            "base_version": 1,
            "is_background": False,
            "is_reviewed": False,
            "boxes": [
                {"id": str(uuid.uuid4()), "class_id": plate, "x": 0.1, "y": 0.1, "w": 0.4, "h": 0.4}
            ],
        },
        headers=XHR,
    )
    assert relabeled.status_code == 200, relabeled.text

    body = options(client, project["project_id"]).json()

    assert body["blockers"] == []
    assert note(body["warnings"], "classesMissingValid")["names"] == ["plate"]
    assert "classesMissingTrain" not in codes(body["warnings"])


def test_a_train_split_of_only_background_images_misses_every_class(client: TestClient) -> None:
    project = setup_project(client, "Backgrounds", background=1, valid=1, classes=("car", "plate"))

    body = options(client, project["project_id"]).json()

    assert body["blockers"] == []  # one usable image is enough
    assert note(body["warnings"], "classesMissingTrain")["names"] == ["car", "plate"]
    assert note(body["warnings"], "classesMissingValid")["names"] == ["plate"]


def test_a_stale_or_missing_heartbeat_warns_and_a_fresh_one_does_not(
    client: TestClient, settings: Settings
) -> None:
    project = setup_project(client, "Plates", train=1, valid=1)

    assert "workerStale" in codes(options(client, project["project_id"]).json()["warnings"])
    write_heartbeat(settings, age_seconds=120)
    assert "workerStale" in codes(options(client, project["project_id"]).json()["warnings"])
    write_heartbeat(settings)
    body = options(client, project["project_id"]).json()
    assert "workerStale" not in codes(body["warnings"])
    assert body["blockers"] == []  # a stale worker never blocks Start


# --------------------------------------------------------------------------
# Models trained here (D-08, MODL-05)
# --------------------------------------------------------------------------


def test_trained_models_of_the_same_task_type_are_listed_newest_first(
    client: TestClient, settings: Settings
) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1, classes=("car", "plate"))
    other = setup_project(client, "Trucks", train=1, valid=1)
    now = datetime.now(UTC)
    older = seed_model(
        settings,
        other["project_id"],
        "truck-1",
        class_names=("car", "plate"),
        map50=0.8123,
        created_at=now - timedelta(hours=2),
    )
    newer = seed_model(
        settings,
        mine["project_id"],
        "run-1",
        class_names=("plate", "car"),
        map50=None,
        created_at=now - timedelta(hours=1),
    )
    seed_model(settings, other["project_id"], "mask-1", task_type="segment", created_at=now)
    fewer = seed_model(
        settings,
        mine["project_id"],
        "run-0",
        class_names=("car",),
        created_at=now - timedelta(hours=3),
    )

    models = options(client, mine["project_id"]).json()["models"]

    assert [item["id"] for item in models] == [newer, older, fewer]
    assert [item["name"] for item in models] == ["run-1", "truck-1", "run-0"]
    assert [item["project_name"] for item in models] == ["Plates", "Trucks", "Plates"]
    assert [item["classes_match"] for item in models] == [False, True, False]
    assert [item["class_count"] for item in models] == [2, 2, 1]
    assert models[1]["map50"] == 0.8123 and models[0]["map50"] is None
    assert models[1]["class_names"] == ["car", "plate"]
    assert models[1]["created_at"].endswith("Z")
    assert models[1]["project_id"] == other["project_id"]


def test_a_segment_project_lists_only_segment_models(
    client: TestClient, settings: Settings
) -> None:
    masks = setup_project(client, "Masks", task_type="segment", train=1, valid=1)
    seed_model(settings, masks["project_id"], "boxes-1", task_type="detect")
    wanted = seed_model(settings, masks["project_id"], "masks-1", task_type="segment")

    models = options(client, masks["project_id"]).json()["models"]

    assert [item["id"] for item in models] == [wanted]
