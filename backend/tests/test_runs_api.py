"""The run-creation contract: bases (official and models trained here), bounds and names.

POST /api/projects/{id}/runs against the real app; the worker side of a model base
(`train_job` loading `data/models/<id>.pt`) runs against a stubbed Ultralytics (D-08,
D-10, T4-01, T4-07, T4-08-01, T4-08-02).
"""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_worker import queue
from yolo_trainer_worker.supervisor import CANCELLED

from .test_runs_cancel import _cancel, _epoch, _queued_runs, _supervisor
from .test_training_pipeline import _install_stub_ultralytics, _run_train_job, _train_to_end
from .test_worker_supervisor import _in_thread, _Spawned, _wait_until
from .training_helpers import post_run, seed_model, setup_project, start_run, wait_status


def run_row(settings: Settings, run_id: int) -> tuple:
    connection = sqlite3.connect(settings.db_path)
    try:
        return connection.execute(
            "SELECT base_kind, base_name, base_model_id FROM training_runs WHERE id = ?",
            (run_id,),
        ).fetchone()
    finally:
        connection.close()


def model_base(model_id: int) -> dict:
    return {"kind": "model", "model_id": model_id}


# --------------------------------------------------------------------------
# A model trained here as the base (D-08)
# --------------------------------------------------------------------------


def test_a_same_task_model_from_another_project_is_a_valid_base(
    client: TestClient, settings: Settings
) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)
    other = setup_project(client, "Trucks", train=1, valid=1)
    model_id = seed_model(settings, other["project_id"], "best-trucks")

    started = start_run(client, mine["project_id"], base=model_base(model_id))

    assert started["base_kind"] == "model"
    assert started["base_name"] == "best-trucks"
    assert run_row(settings, started["id"]) == ("model", "best-trucks", model_id)
    wait_status(client, mine["project_id"], started["id"], {"queued"})
    job = json.loads(
        layout.run_dir(settings.data_dir, started["id"]).joinpath("job.json").read_text()
    )
    assert job["base"] == {"kind": "model", "name": "best-trucks", "model_id": model_id}


def test_a_model_of_another_task_type_is_refused(client: TestClient, settings: Settings) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)
    masks = seed_model(settings, mine["project_id"], "masks", task_type="segment")

    response = post_run(client, mine["project_id"], base=model_base(masks))

    assert response.status_code == 422
    assert response.json()["detail"] == "This model was trained for a different task type."
    assert client.get(f"/api/projects/{mine['project_id']}/runs").json() == []


def test_an_unknown_model_is_refused(client: TestClient) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)

    response = post_run(client, mine["project_id"], base=model_base(999))

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown model."


def test_a_model_whose_file_was_deleted_is_refused(client: TestClient, settings: Settings) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)
    gone = seed_model(settings, mine["project_id"], "gone", with_file=False)

    response = post_run(client, mine["project_id"], base=model_base(gone))

    assert response.status_code == 422
    assert response.json()["detail"] == "The model file is missing."
    assert client.get(f"/api/projects/{mine['project_id']}/runs").json() == []


@pytest.mark.parametrize(
    "base",
    [
        {"kind": "model", "model_id": 1, "path": "/etc/passwd"},
        {"kind": "model", "path": "../models/1.pt"},
        {"kind": "model", "model_id": 0},
        {"kind": "model", "model_id": "1"},
        {"kind": "official", "name": "yolo26n", "model_id": 1},
        {"kind": "path", "name": "yolo26n"},
    ],
)
def test_a_base_never_carries_a_path_or_stray_keys(
    client: TestClient, settings: Settings, base: dict
) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)
    seed_model(settings, mine["project_id"], "first")

    response = post_run(client, mine["project_id"], base=base)

    assert response.status_code == 422


def test_a_blocked_project_refuses_a_model_base_too(client: TestClient, settings: Settings) -> None:
    mine = setup_project(client, "NoValid", train=1)
    model_id = seed_model(settings, mine["project_id"], "first")

    response = post_run(client, mine["project_id"], base=model_base(model_id))

    assert response.status_code == 422
    assert response.json()["detail"] == service.VALID_EMPTY_DETAIL


# --------------------------------------------------------------------------
# Names (D-10)
# --------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["", "   ", "x" * 101, "bad\nname", "tab\tname"])
def test_run_names_follow_the_project_name_rules(client: TestClient, name: str) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)

    response = post_run(client, mine["project_id"], name=name)

    assert response.status_code == 422


def test_run_names_are_trimmed(client: TestClient) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)

    started = start_run(client, mine["project_id"], name="  Night run  ")

    assert started["name"] == "Night run"


def test_a_name_that_differs_only_by_case_is_a_409_quoting_the_stored_name(
    client: TestClient,
) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)
    start_run(client, mine["project_id"], name="run-1")

    clash = post_run(client, mine["project_id"], name="Run-1")

    assert clash.status_code == 409
    assert clash.json()["detail"] == 'A run named "run-1" already exists in this project.'


def test_the_default_name_is_the_smallest_free_number(client: TestClient) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)
    start_run(client, mine["project_id"], name="run-1")
    start_run(client, mine["project_id"], name="run-3")

    started = start_run(client, mine["project_id"], name=None)

    assert started["name"] == "run-2"


def test_the_same_run_name_is_free_in_another_project(client: TestClient) -> None:
    first = setup_project(client, "Plates", train=1, valid=1)
    second = setup_project(client, "Trucks", train=1, valid=1)
    start_run(client, first["project_id"], name="run-1")

    assert start_run(client, second["project_id"], name="run-1")["name"] == "run-1"


# --------------------------------------------------------------------------
# Bounds (T4-07)
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"epochs": 0},
        {"epochs": 1001},
        {"imgsz": 641},
        {"imgsz": 4096},
        {"batch": 0},
        {"batch": 513},
        {"batch": -2},
        {"epochs": 1.5},
        {"surprise": 1},
    ],
)
def test_out_of_range_settings_are_refused(client: TestClient, overrides: dict) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)

    response = post_run(client, mine["project_id"], **overrides)

    assert response.status_code == 422
    assert client.get(f"/api/projects/{mine['project_id']}/runs").json() == []


def test_the_documented_extremes_are_accepted(client: TestClient) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)

    low = start_run(client, mine["project_id"], epochs=1, imgsz=32, batch=-1)
    high = start_run(client, mine["project_id"], epochs=1000, imgsz=2048, batch=512)

    assert (low["settings"]["batch"], high["settings"]["batch"]) == (-1, 512)


# --------------------------------------------------------------------------
# The worker loads the chosen model (T4-01, T4-08-01)
# --------------------------------------------------------------------------


def _job_with_base(data_dir: Path, base: dict) -> Path:
    run_directory = layout.run_dir(data_dir, 7)
    run_directory.mkdir(parents=True)
    layout.write_json_atomic(
        run_directory / layout.JOB_FILE,
        {
            "schema_version": 1,
            "run_id": 7,
            "task_type": "detect",
            "base": base,
            "settings": {"epochs": 2, "imgsz": 64, "batch": 2, "device": "cpu"},
        },
    )
    return run_directory


def _record_yolo_argument(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    import ultralytics

    paths: list[str] = []
    stub = ultralytics.YOLO

    class Recording(stub):  # type: ignore[valid-type, misc]
        def __init__(self, path: str) -> None:
            paths.append(path)
            super().__init__(path)

    monkeypatch.setattr(ultralytics, "YOLO", Recording)
    return paths


def test_train_job_trains_from_the_registered_model_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    _install_stub_ultralytics(monkeypatch, calls)
    paths = _record_yolo_argument(monkeypatch)
    data_dir = tmp_path / "data"
    layout.models_root(data_dir).mkdir(parents=True)
    layout.model_file(data_dir, 4).write_bytes(b"trained weights")
    run_directory = _job_with_base(
        data_dir, {"kind": "model", "name": "best-trucks", "model_id": 4}
    )

    assert _run_train_job(data_dir, run_directory) == 0

    assert paths == [str(layout.model_file(data_dir, 4))]
    assert "download" not in calls
    result = json.loads((run_directory / layout.RESULT_FILE).read_text(encoding="utf-8"))
    assert result["base_weights"]["name"] == "best-trucks"


def test_train_job_fails_plainly_when_the_base_model_file_is_gone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    _install_stub_ultralytics(monkeypatch, calls)
    paths = _record_yolo_argument(monkeypatch)
    data_dir = tmp_path / "data"
    run_directory = _job_with_base(data_dir, {"kind": "model", "name": "gone", "model_id": 4})

    assert _run_train_job(data_dir, run_directory) == 1

    error = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert error["message"] == "The base model file is missing."
    assert paths == [] and "train" not in calls


def test_train_job_refuses_a_model_id_that_is_not_a_whole_number(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    _install_stub_ultralytics(monkeypatch, calls)
    paths = _record_yolo_argument(monkeypatch)
    data_dir = tmp_path / "data"
    run_directory = _job_with_base(
        data_dir, {"kind": "model", "name": "evil", "model_id": "../weights/yolo26n"}
    )

    assert _run_train_job(data_dir, run_directory) == 1

    assert paths == []


# --------------------------------------------------------------------------
# The history list: one row per run, read from the database only (TRAN-08, D-14)
# --------------------------------------------------------------------------


def _listed(client: TestClient, project_id: int) -> list[dict]:
    response = client.get(f"/api/projects/{project_id}/runs")
    assert response.status_code == 200, response.text
    return response.json()


def test_a_completed_run_lists_its_final_metrics_settings_and_snapshot_size(
    client: TestClient, settings: Settings
) -> None:
    done = _train_to_end(client, settings, "success")
    project_id, run_id = done["ids"]["project_id"], done["run_id"]

    (row,) = _listed(client, project_id)

    assert row["id"] == run_id and row["status"] == "completed"
    # the final validation wins; the last epoch's mAP50-95 is kept next to it
    assert (row["map50"], row["map50_95"]) == (0.7, 0.4)
    assert row["last_map50_95"] == 0.35
    assert row["image_count"] == 3  # train 2 + valid 1 of the snapshot
    assert row["settings"] == {"epochs": 2, "imgsz": 64, "batch": 2, "device": "cpu"}
    assert row["resolved"] == {"device": "cpu", "batch": 2, "workers": 0}


def test_a_run_cancelled_after_one_epoch_lists_the_last_epoch_mean_average_precision(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    spawned = _Spawned()
    spawned.install(monkeypatch)
    project_id, (run,) = _queued_runs(client, 1, name="History")
    supervisor, engine = _supervisor(settings, "sleep")
    assert queue.claim_next(engine) == run["id"]
    thread, outcome = _in_thread(lambda: supervisor.run_claimed(run["id"], threading.Event()))
    _wait_until(lambda: _epoch(client, project_id, run["id"]) == 1)
    assert _cancel(client, project_id, run["id"]).status_code == 200
    thread.join(timeout=15)
    assert outcome == [CANCELLED]
    wait_status(client, project_id, run["id"], {"cancelled"})

    (row,) = _listed(client, project_id)

    assert row["status"] == "cancelled"
    assert row["map50"] is None  # no final validation ever ran
    assert row["last_map50"] == 0.5
    assert row["map50_95"] == 0.3  # the last epoch's value stands in for the missing final one
    assert row["last_map50_95"] == 0.3
    assert row["image_count"] == 3


def test_a_queued_run_lists_no_metrics_but_its_settings_and_snapshot_size(
    client: TestClient,
) -> None:
    mine = setup_project(client, "Plates", train=2, valid=1, test=1)
    started = start_run(client, mine["project_id"], imgsz=96, batch=-1, device="auto")
    wait_status(client, mine["project_id"], started["id"], {"queued"})

    (row,) = _listed(client, mine["project_id"])

    assert (row["map50"], row["map50_95"], row["last_map50"], row["last_map50_95"]) == (
        None,
        None,
        None,
        None,
    )
    assert row["image_count"] == 4
    assert row["settings"] == {"epochs": 2, "imgsz": 96, "batch": -1, "device": "auto"}
    assert row["resolved"] is None


def test_the_detail_of_a_run_carries_the_same_new_fields_as_its_list_row(
    client: TestClient, settings: Settings
) -> None:
    done = _train_to_end(client, settings, "success")
    project_id, run_id = done["ids"]["project_id"], done["run_id"]

    detail = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    (row,) = _listed(client, project_id)

    for key in ("map50_95", "last_map50_95", "image_count", "settings", "resolved"):
        assert detail[key] == row[key], key


def test_listing_the_history_checks_no_file_per_row(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    mine = setup_project(client, "Plates", train=1, valid=1)
    for number in range(3):
        started = start_run(client, mine["project_id"], name=f"run-{number}")
        wait_status(client, mine["project_id"], started["id"], {"queued"})
    touched: list[object] = []

    def refuse(*args: object, **kwargs: object) -> bool:
        touched.append(args)
        return False

    monkeypatch.setattr(Path, "is_file", refuse)

    assert len(_listed(client, mine["project_id"])) == 3
    assert touched == []
