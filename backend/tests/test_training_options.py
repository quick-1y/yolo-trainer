"""GET /api/projects/{id}/training/options and the device check on run creation (D-07, D-09)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings
from yolo_trainer_common.layout import heartbeat_file, write_json_atomic

from .training_helpers import post_run, setup_project, start_run


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
