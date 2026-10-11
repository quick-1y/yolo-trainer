"""The training chain in-process: split, start, snapshot, claim, supervise, register, download.

Real app (TestClient over a temp-file SQLite database with real Alembic migrations),
real files on disk, the real worker queue and supervisor - only the training command
is replaced by `fake_train_job.py`, and the `train_job` module is exercised against a
stubbed Ultralytics, so no torch is imported and nothing trains (TRAN-01/03/04,
MODL-03/04, DATA-05).
"""

from __future__ import annotations

import json
import sqlite3
import sys
import threading
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel, TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_api.training.labels import data_yaml, label_rows
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_common.progress import ProgressTail, clean_log_tail, jsonable, primary_metrics
from yolo_trainer_worker import queue, train_job
from yolo_trainer_worker.supervisor import Supervisor

from .fake_train_job import BEST_BYTES, LAST_BYTES
from .training_helpers import (
    XHR,
    fake_command,
    post_run,
    set_split,
    setup_project,
    start_run,
    wait_status,
    worker_settings,
)


def _supervisor(settings: Settings, mode: str) -> tuple[Supervisor, object]:
    engine = queue.create_worker_engine(worker_settings(settings))
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command(mode),
        tick_seconds=0.05,
    )
    return supervisor, engine


def _train_to_end(client: TestClient, settings: Settings, mode: str, **project: int) -> dict:
    """Create a project, start a run, let the supervisor claim and finish it."""
    ids = setup_project(client, "Pipeline", train=2, valid=1, **project)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    supervisor, engine = _supervisor(settings, mode)
    run_id = queue.claim_next(engine)
    assert run_id == run["id"]
    supervisor.run_claimed(run_id, threading.Event())
    return {"ids": ids, "run_id": run_id, "engine": engine}


# --------------------------------------------------------------------------
# Splits (DATA-05, D-01, D-02)
# --------------------------------------------------------------------------


def test_split_sets_only_the_listed_images_and_leaves_annotation_state_alone(
    client: TestClient,
) -> None:
    mine = setup_project(client, "Mine", train=3)
    other = setup_project(client, "Other", train=1)
    before = [
        client.get(f"/api/projects/{mine['project_id']}/images/{image_id}/annotations").json()
        for image_id in mine["train"]
    ]

    response = set_split(client, mine["project_id"], [*mine["train"], other["train"][0]], "valid")

    assert response.status_code == 200
    assert response.json() == {"updated": 3}
    items = client.get(f"/api/projects/{mine['project_id']}/images").json()["items"]
    assert {item["split"] for item in items} == {"valid"}
    after = [
        client.get(f"/api/projects/{mine['project_id']}/images/{image_id}/annotations").json()
        for image_id in mine["train"]
    ]
    assert after == before  # same version, flags and boxes: not an annotation change
    foreign = client.get(f"/api/projects/{other['project_id']}/images/{other['train'][0]}").json()
    assert foreign["split"] == "train"


def test_split_null_unassigns_and_status_counts_report_the_splits(client: TestClient) -> None:
    ids = setup_project(client, "Counts", train=2, valid=1, unassigned=1)
    set_split(client, ids["project_id"], [ids["train"][0]], None)

    counts = client.get(f"/api/projects/{ids['project_id']}/images/status-counts").json()

    assert counts["splits"] == {"train": 1, "valid": 1, "test": 0, "none": 2}
    assert sum(counts["splits"].values()) == counts["total"]


def test_split_needs_the_xhr_header_and_a_valid_body(client: TestClient) -> None:
    ids = setup_project(client, "Guard", train=1)
    url = f"/api/projects/{ids['project_id']}/images/split"

    assert client.post(url, json={"ids": ids["train"], "split": "valid"}).status_code == 403
    assert client.post(url, json={"ids": ids["train"]}, headers=XHR).status_code == 422
    assert (
        client.post(url, json={"ids": ids["train"], "split": "holdout"}, headers=XHR).status_code
        == 422
    )
    assert client.post(url, json={"ids": [], "split": "train"}, headers=XHR).status_code == 422


# --------------------------------------------------------------------------
# Starting a run (TRAN-01, TRAN-03, D-04, D-05, D-10, D-19, D-20)
# --------------------------------------------------------------------------


def test_a_run_is_refused_without_classes(client: TestClient) -> None:
    ids = setup_project(client, "NoClasses", classes=())

    response = post_run(client, ids["project_id"])

    assert response.status_code == 422
    assert response.json()["detail"] == service.NO_CLASSES_DETAIL


def test_train_and_valid_must_hold_annotated_images(client: TestClient) -> None:
    only_unannotated = setup_project(client, "OnlyEmpty", unannotated=2, valid=1)
    no_valid = setup_project(client, "NoValid", train=1)

    train_empty = post_run(client, only_unannotated["project_id"])
    valid_empty = post_run(client, no_valid["project_id"])

    assert train_empty.status_code == 422
    assert train_empty.json()["detail"] == service.TRAIN_EMPTY_DETAIL
    assert valid_empty.status_code == 422
    assert valid_empty.json()["detail"] == service.VALID_EMPTY_DETAIL
    # a refused start leaves no run behind
    assert client.get(f"/api/projects/{no_valid['project_id']}/runs").json() == []


def test_start_snapshots_annotated_images_only_and_materializes_the_dataset(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Snap", train=2, background=1, valid=1, unannotated=1, unassigned=1)

    started = start_run(client, ids["project_id"])

    assert started["status"] == "preparing"
    assert started["name"] == "run-1"
    run = wait_status(client, ids["project_id"], started["id"], {"queued"})
    assert run["dataset_counts"] == {"train": 3, "valid": 1, "test": 0}
    assert run["queue_position"] == 1
    assert run["class_names"] == ["box"]

    dataset = layout.dataset_dir(settings.data_dir, started["id"])
    train_images = sorted((dataset / "train" / "images").iterdir())
    train_labels = sorted((dataset / "train" / "labels").iterdir())
    assert len(train_images) == 3 and len(train_labels) == 3
    # the unannotated image and the unassigned one never entered the dataset (ANNO-10)
    used = {path.stem for path in train_images}
    assert str(ids["unannotated"][0]) not in used
    assert str(ids["unassigned"][0]) not in used
    background_label = dataset / "train" / "labels" / f"{ids['background'][0]}.txt"
    assert background_label.read_bytes() == b""
    box_label = (dataset / "train" / "labels" / f"{ids['train'][0]}.txt").read_text()
    assert box_label.split() == ["0", "0.500000", "0.500000", "0.500000", "0.500000"]
    assert not (dataset / "test").exists()
    yaml_text = (dataset / "data.yaml").read_text(encoding="utf-8")
    assert "test:" not in yaml_text and "path:" not in yaml_text
    assert yaml_text.splitlines()[-1] == '  0: "box"'

    manifest = json.loads((dataset / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["counts"] == {"train": 3, "valid": 1, "test": 0}
    assert manifest["excluded_unannotated"] == {"train": 1, "valid": 0, "test": 0}
    assert manifest["classes"] == [{"index": 0, "id": ids["class_ids"][0], "name": "box"}]
    assert {item["image_id"] for item in manifest["images"]} == used_ids(dataset)
    job = json.loads(
        layout.run_dir(settings.data_dir, started["id"]).joinpath("job.json").read_text()
    )
    assert job["base"] == {"kind": "official", "name": "yolo26n", "model_id": None}
    assert job["settings"]["epochs"] == 2


def used_ids(dataset: Path) -> set[int]:
    return {
        int(path.stem)
        for split in ("train", "valid", "test")
        if (dataset / split / "images").exists()
        for path in (dataset / split / "images").iterdir()
    }


def test_materialized_images_are_hard_links_of_the_project_images(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Links", train=1, valid=1)

    started = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], started["id"], {"queued"})

    linked = layout.dataset_dir(settings.data_dir, started["id"]) / "train" / "images"
    (image,) = linked.iterdir()
    assert image.stat().st_nlink >= 2


def test_a_segment_project_gets_polygon_rows_and_only_seg_bases(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Seg", task_type="segment", train=1, valid=1)

    mismatch = post_run(client, ids["project_id"])
    started = start_run(client, ids["project_id"], base={"kind": "official", "name": "yolo26n-seg"})
    wait_status(client, ids["project_id"], started["id"], {"queued"})

    assert mismatch.status_code == 422
    assert mismatch.json()["detail"] == service.BASE_TASK_MISMATCH_DETAIL
    label = layout.dataset_dir(settings.data_dir, started["id"]) / "train" / "labels"
    (row,) = (next(label.iterdir())).read_text().splitlines()
    assert len(row.split()) == 9  # class + four corners


def test_names_are_numbered_and_unique_per_project(client: TestClient) -> None:
    ids = setup_project(client, "Names", train=1, valid=1)

    first = start_run(client, ids["project_id"])
    second = start_run(client, ids["project_id"])
    clash = post_run(client, ids["project_id"], name="run-1")
    renamed = start_run(client, ids["project_id"], name="Night run")

    assert (first["name"], second["name"], renamed["name"]) == ("run-1", "run-2", "Night run")
    assert clash.status_code == 409
    assert clash.json()["detail"] == 'A run named "run-1" already exists in this project.'
    listed = client.get(f"/api/projects/{ids['project_id']}/runs").json()
    assert [item["id"] for item in listed] == sorted((item["id"] for item in listed), reverse=True)
    assert len(listed) == 3


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"imgsz": 100}, "imgsz: must be a multiple of 32"),
        ({"imgsz": 4096}, "imgsz"),
        ({"batch": 0}, "batch: must be -1 (auto) or a whole number from 1 to 512"),
        ({"epochs": 0}, "epochs"),
        ({"epochs": 1001}, "epochs"),
        ({"device": "cuda:1"}, "device"),
        ({"surprise": 1}, "surprise"),
        ({"base": {"kind": "official", "name": "../../etc/passwd"}}, ""),
        ({"base": {"kind": "official", "name": "yolov8n"}}, ""),
        ({"base": {"kind": "path", "name": "yolo26n"}}, "base: Input tag 'path'"),
    ],
)
def test_run_requests_are_validated_on_the_server(
    client: TestClient, overrides: dict, message: str
) -> None:
    ids = setup_project(client, "Validate", train=1, valid=1)

    response = post_run(client, ids["project_id"], **overrides)

    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_starting_a_run_needs_the_xhr_header(client: TestClient) -> None:
    ids = setup_project(client, "RunGuard", train=1, valid=1)
    body = {
        "base": {"kind": "official", "name": "yolo26n"},
        "epochs": 1,
        "imgsz": 64,
        "batch": 2,
        "device": "cpu",
    }

    response = client.post(f"/api/projects/{ids['project_id']}/runs", json=body)

    assert response.status_code == 403
    assert client.get(f"/api/projects/{ids['project_id']}/runs/999").status_code == 404


def test_the_snapshot_is_independent_of_later_edits(client: TestClient, settings: Settings) -> None:
    ids = setup_project(client, "Frozen", train=1, valid=1)
    started = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], started["id"], {"queued"})
    train_labels = layout.dataset_dir(settings.data_dir, started["id"]) / "train" / "labels"
    before = next(train_labels.iterdir()).read_text()

    client.post(
        f"/api/projects/{ids['project_id']}/images/delete",
        json={"ids": ids["train"]},
        headers=XHR,
    )

    assert next(train_labels.iterdir()).read_text() == before
    assert len(list((train_labels.parent / "images").iterdir())) == 1


# --------------------------------------------------------------------------
# Worker: claim, supervise, register, download (TRAN-04, MODL-03, MODL-04)
# --------------------------------------------------------------------------


def test_claim_is_fifo_and_only_one_run_is_running_at_a_time(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Fifo", train=1, valid=1)
    first = start_run(client, ids["project_id"])
    second = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], first["id"], {"queued"})
    wait_status(client, ids["project_id"], second["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))

    assert queue.claim_next(engine) == first["id"]
    assert queue.claim_next(engine) is None  # one at a time (D-11)
    waiting = client.get(f"/api/projects/{ids['project_id']}/runs/{second['id']}").json()
    assert waiting["status"] == "queued"
    assert waiting["queue_position"] == 1


def test_a_clean_run_registers_best_pt_as_a_model_and_it_downloads(
    client: TestClient, settings: Settings
) -> None:
    done = _train_to_end(client, settings, "success")
    project_id, run_id = done["ids"]["project_id"], done["run_id"]

    run = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()

    assert run["status"] == "completed"
    assert (run["epoch"], run["epochs"]) == (2, 2)  # the final validation never counts (D-12)
    assert run["map50"] == 0.7  # from the final-validation event
    assert run["metrics"] == {"precision": 0.8, "recall": 0.7, "map50": 0.7, "map50_95": 0.4}
    assert run["resolved"] == {"device": "cpu", "batch": 2, "workers": 0}
    with Session(done["engine"]) as session:
        (model,) = session.scalars(select(TrainedModel)).all()
        assert model.class_names == ["box"]
        assert (model.name, model.task_type, model.source) == ("run-1", "detect", "trained")
        assert (model.base_name, model.project_id, model.source_run_id) == (
            "yolo26n",
            project_id,
            run_id,
        )
        assert model.size_bytes == len(BEST_BYTES)
        assert model.map50 == 0.7
        stored = layout.model_file(settings.data_dir, model.id)
        assert stored.read_bytes() == BEST_BYTES
        assert run["model"]["id"] == model.id
    models_dir = layout.models_root(settings.data_dir)
    assert [path.name for path in models_dir.iterdir()] == [f"{run['model']['id']}.pt"]
    assert LAST_BYTES not in [path.read_bytes() for path in models_dir.iterdir()]

    download = client.get(f"/api/models/{run['model']['id']}/download")
    assert download.status_code == 200
    assert download.content == BEST_BYTES
    assert download.headers["content-type"] == "application/octet-stream"
    assert "Pipeline_run-1_best.pt" in download.headers["content-disposition"]
    assert client.get("/api/models/9999/download").status_code == 404


def test_a_failing_trainer_keeps_its_message_and_a_clean_log_tail(
    client: TestClient, settings: Settings
) -> None:
    done = _train_to_end(client, settings, "fail")

    run = client.get(f"/api/projects/{done['ids']['project_id']}/runs/{done['run_id']}").json()

    assert run["status"] == "failed"
    assert run["error_message"] == "Fake failure."
    assert run["log_tail"].splitlines()[-4:] == ["line 1", "line 2", "line 3", "progress 50%"]
    assert "\x1b" not in run["log_tail"]
    assert run["model"] is None


def test_a_crashing_trainer_reports_the_exit_code(client: TestClient, settings: Settings) -> None:
    done = _train_to_end(client, settings, "crash")

    run = client.get(f"/api/projects/{done['ids']['project_id']}/runs/{done['run_id']}").json()

    assert run["status"] == "failed"
    assert run["error_message"] == "The training process exited with code 3."
    assert run["log_tail"] == "about to crash"


def test_a_model_whose_classes_differ_from_the_dataset_is_not_registered(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Mismatch", train=1, valid=1)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    supervisor, engine = _supervisor(settings, "success")
    queue.claim_next(engine)
    with Session(engine) as session, session.begin():
        session.get(TrainingRun, run["id"]).class_names = ["car"]

    supervisor.run_claimed(run["id"], threading.Event())

    finished = client.get(f"/api/projects/{ids['project_id']}/runs/{run['id']}").json()
    assert finished["status"] == "failed"
    assert finished["error_message"] == "The trained model's class names do not match the dataset."
    assert finished["model"] is None


def test_reconcile_on_start_interrupts_running_runs_and_keeps_queued_ones(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Restart", train=1, valid=1)
    running = start_run(client, ids["project_id"])
    waiting = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], running["id"], {"queued"})
    wait_status(client, ids["project_id"], waiting["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == running["id"]

    assert queue.reconcile_on_start(engine) == 1

    interrupted = client.get(f"/api/projects/{ids['project_id']}/runs/{running['id']}").json()
    assert interrupted["status"] == "interrupted"
    assert interrupted["error_message"] == queue.INTERRUPTED_ON_RESTART_MESSAGE
    assert interrupted["finished_at"].endswith("Z")
    queued = client.get(f"/api/projects/{ids['project_id']}/runs/{waiting['id']}").json()
    assert queued["status"] == "queued"
    assert queue.claim_next(engine) == waiting["id"]  # and it starts by itself


def test_a_missing_dataset_fails_the_claimed_run(client: TestClient, settings: Settings) -> None:
    ids = setup_project(client, "Vanished", train=1, valid=1)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    layout.run_dir(settings.data_dir, run["id"]).joinpath(layout.JOB_FILE).unlink()
    supervisor, engine = _supervisor(settings, "success")
    queue.claim_next(engine)

    assert supervisor.run_claimed(run["id"], threading.Event()) == "failed"

    finished = client.get(f"/api/projects/{ids['project_id']}/runs/{run['id']}").json()
    assert finished["error_message"] == "The prepared dataset is missing."


def test_a_vanished_source_image_fails_the_preparing_run(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    ids = setup_project(client, "Gone", train=1, valid=1)
    real_materialize = service.materialize

    def delete_then_materialize(data_dir: Path, snapshot) -> None:  # noqa: ANN001
        for item in snapshot.images:
            (data_dir / "projects" / str(snapshot.project_id) / "images").joinpath(
                f"{item.image_id}.{item.ext}"
            ).unlink()
        real_materialize(data_dir, snapshot)

    monkeypatch.setattr(service, "materialize", delete_then_materialize)

    started = start_run(client, ids["project_id"])

    run = client.get(f"/api/projects/{ids['project_id']}/runs/{started['id']}").json()
    assert run["status"] == "failed"
    assert run["error_message"] == service.PREPARE_SOURCE_MISSING_DETAIL
    assert not layout.run_dir(settings.data_dir, started["id"]).exists()


def test_the_run_rows_live_in_the_shared_database_file(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Shared", train=1, valid=1)
    started = start_run(client, ids["project_id"])

    connection = sqlite3.connect(settings.db_path)
    try:
        row = connection.execute(
            "SELECT status, base_kind, base_name FROM training_runs WHERE id = ?", (started["id"],)
        ).fetchone()
    finally:
        connection.close()

    assert row[1:] == ("official", "yolo26n")


# --------------------------------------------------------------------------
# Pure helpers
# --------------------------------------------------------------------------


def test_label_rows_and_data_yaml() -> None:
    box = [(1, 0.25, 0.5, 0.5, 0.25)]

    assert label_rows(box, "detect") == ["1 0.500000 0.625000 0.500000 0.250000"]
    assert label_rows(box, "segment") == [
        "1 0.250000 0.500000 0.750000 0.500000 0.750000 0.750000 0.250000 0.750000"
    ]
    assert label_rows([(0, 0.9, 0.9, 0.3, 0.3)], "detect")[0].endswith("1.000000 0.300000 0.300000")
    assert data_yaml(["грузовик", 'a"b'], has_test=False) == (
        'train: train/images\nval: valid/images\nnames:\n  0: "грузовик"\n  1: "a\\"b"\n'
    )
    assert "test: test/images" in data_yaml(["car"], has_test=True)


def test_download_names_are_reduced_to_safe_characters() -> None:
    assert service.model_download_name("Тест проект", "run-1") == "Тест_проект_run-1_best.pt"
    assert service.model_download_name("../../evil", "run 1") == "_.._evil_run_1_best.pt"
    long_name = service.model_download_name("p" * 300, "run-1")
    assert len(long_name) == 120 and long_name.endswith("_best.pt")


def test_jsonable_walks_nested_values_and_drops_non_finite_numbers() -> None:
    class TensorLike:
        def detach(self) -> TensorLike:
            return self

        def cpu(self) -> TensorLike:
            return self

        def tolist(self) -> list[float]:
            return [1.5, float("nan")]

    converted = jsonable(
        {"a": {"b": [TensorLike(), (1, float("inf"))]}, 3: object().__class__, "n": None}
    )

    assert converted["a"]["b"] == [[1.5, None], [1, None]]
    assert converted["3"] == "<class 'object'>"
    json.dumps(converted, allow_nan=False)


def test_the_progress_tail_returns_only_complete_lines(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    tail = ProgressTail()
    assert tail.read_new_events(path) == []

    path.write_text('{"n": 1}\n{"n": 2', encoding="utf-8")
    assert tail.read_new_events(path) == [{"n": 1}]
    with path.open("a", encoding="utf-8") as handle:
        handle.write('}\nnot json\n{"n": 3}\n')
    assert tail.read_new_events(path) == [{"n": 2}, {"n": 3}]
    assert tail.read_new_events(path) == []


def test_primary_metrics_read_the_task_keys_and_the_log_tail_is_cleaned() -> None:
    metrics = {"metrics/mAP50(M)": 0.5, "metrics/mAP50(B)": 0.9, "val/seg_loss": 1.0}

    assert primary_metrics("segment", metrics)["map50"] == 0.5
    assert primary_metrics("detect", metrics)["map50"] == 0.9
    assert primary_metrics("detect", None) == dict.fromkeys(
        ("precision", "recall", "map50", "map50_95")
    )
    noisy = "a\r\x1b[K 10%\rb\n\n\x1b[31mc\x1b[0m\n" + "".join(f"l{n}\n" for n in range(60))
    assert clean_log_tail(noisy).splitlines() == [f"l{n}" for n in range(10, 60)]


# --------------------------------------------------------------------------
# train_job against a stubbed Ultralytics (T4-01, T4-08)
# --------------------------------------------------------------------------


class _StubTrainer:
    def __init__(self, epoch: int, epochs: int, metrics: dict) -> None:
        self.epoch = epoch
        self.epochs = epochs
        self.metrics = metrics
        self.stop = epoch + 1 >= epochs  # True on the last real epoch, as in Ultralytics
        self.fitness = 0.5
        self.tloss = {"box_loss": _Scalar(1.25)}
        self.last = Path("last.pt")
        self.best = Path("best.pt")


class _Scalar:
    """Duck-typed tensor scalar: `train_job` must not need torch to serialize it."""

    def __init__(self, value: float) -> None:
        self.value = value

    def tolist(self) -> float:
        return self.value


def _install_stub_ultralytics(
    monkeypatch: pytest.MonkeyPatch, calls: list[str], download_creates: bool = False
) -> None:
    callbacks: dict[str, list] = {}

    class StubYOLO:
        task = "detect"
        names = {0: "box"}

        def __init__(self, path: str) -> None:
            calls.append("YOLO")

        def add_callback(self, name: str, function) -> None:  # noqa: ANN001
            callbacks.setdefault(name, []).append(function)

        def train(self, **kwargs: object) -> None:
            calls.append("train")
            assert kwargs["plots"] is False and kwargs["workers"] == 0
            for epoch in range(2):
                trainer = _StubTrainer(epoch, 2, {"metrics/mAP50(B)": 0.1 * (epoch + 1)})
                for name in ("on_train_epoch_end", "on_fit_epoch_end"):
                    for function in callbacks[name]:
                        function(trainer)
            # the extra validation of best.pt: epoch advanced, no on_train_epoch_end before it
            final = _StubTrainer(2, 2, {"metrics/mAP50(B)": 0.3})
            for function in callbacks["on_fit_epoch_end"]:
                function(final)
            for function in callbacks["on_train_end"]:
                function(final)

    class StubSettings:
        def update(self, values: dict) -> None:
            calls.append("settings.update")
            assert values["sync"] is False

    root = types.ModuleType("ultralytics")
    root.__version__ = "0.0.0-stub"
    root.settings = StubSettings()
    root.YOLO = StubYOLO
    data = types.ModuleType("ultralytics.data")
    data_utils = types.ModuleType("ultralytics.data.utils")
    data_utils.check_font = lambda font="Arial.ttf": calls.append("check_font")
    data.utils = data_utils
    root.data = data
    utils = types.ModuleType("ultralytics.utils")
    downloads = types.ModuleType("ultralytics.utils.downloads")

    def attempt_download_asset(path: str) -> None:
        calls.append("download")
        if download_creates:
            Path(path).write_bytes(b"weights")

    downloads.attempt_download_asset = attempt_download_asset
    utils.downloads = downloads
    root.utils = utils
    torch = types.ModuleType("torch")
    torch.__version__ = "0.0.0-stub"
    for name, module in {
        "ultralytics": root,
        "ultralytics.data": data,
        "ultralytics.data.utils": data_utils,
        "ultralytics.utils": utils,
        "ultralytics.utils.downloads": downloads,
        "torch": torch,
    }.items():
        monkeypatch.setitem(sys.modules, name, module)


def _prepare_job(tmp_path: Path, name: str = "yolo26n", cached: bool = True) -> tuple[Path, Path]:
    data_dir = tmp_path / "data"
    run_directory = layout.run_dir(data_dir, 7)
    run_directory.mkdir(parents=True)
    layout.write_json_atomic(
        run_directory / layout.JOB_FILE,
        {
            "schema_version": 1,
            "run_id": 7,
            "task_type": "detect",
            "base": {"kind": "official", "name": name, "model_id": None},
            "settings": {"epochs": 2, "imgsz": 64, "batch": 2, "device": "cpu"},
        },
    )
    if cached:
        layout.weights_root(data_dir).mkdir(parents=True)
        layout.weights_file(data_dir, name).write_bytes(b"weights")
    return data_dir, run_directory


def _run_train_job(data_dir: Path, run_directory: Path) -> int:
    return train_job.main(
        [
            "--run-dir",
            str(run_directory),
            "--data-dir",
            str(data_dir),
            "--device",
            "cpu",
            "--batch",
            "2",
            "--workers",
            "0",
        ]
    )


def test_train_job_disables_sync_first_and_tags_the_final_validation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    _install_stub_ultralytics(monkeypatch, calls)
    data_dir, run_directory = _prepare_job(tmp_path)

    assert _run_train_job(data_dir, run_directory) == 0

    assert calls.index("settings.update") < calls.index("YOLO") < calls.index("train")
    assert "download" not in calls  # the cached weights are reused
    events = [
        json.loads(line)
        for line in (run_directory / layout.PROGRESS_FILE).read_text(encoding="utf-8").splitlines()
    ]
    fits = [event for event in events if event["event"] == "fit_epoch_end"]
    assert [(event["epoch"], event["final_validation"]) for event in fits] == [
        (1, False),
        (2, False),
        (2, True),
    ]
    assert fits[-1]["metrics"] == {"metrics/mAP50(B)": 0.3}
    assert [event.get("last_epoch") for event in fits] == [False, True, None]
    assert [event.get("fitness") for event in fits] == [0.5, 0.5, None]
    assert {event["v"] for event in events} == {2}
    first_tloss = next(event for event in events if event["event"] == "train_epoch_end")["tloss"]
    assert first_tloss == {"box_loss": 1.25}
    result = json.loads((run_directory / layout.RESULT_FILE).read_text(encoding="utf-8"))
    assert result["names"] == ["box"] and result["task"] == "detect"
    assert result["base_weights"]["name"] == "yolo26n"
    assert len(result["base_weights"]["sha256"]) == 64
    assert not (run_directory / layout.ERROR_FILE).exists()


def test_train_job_downloads_missing_weights_into_the_cache_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    _install_stub_ultralytics(monkeypatch, calls, download_creates=True)
    data_dir, run_directory = _prepare_job(tmp_path, cached=False)

    assert _run_train_job(data_dir, run_directory) == 0

    assert "download" in calls
    assert layout.weights_file(data_dir, "yolo26n").read_bytes() == b"weights"


def test_train_job_reports_a_failed_download_in_plain_words(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    _install_stub_ultralytics(monkeypatch, calls, download_creates=False)
    data_dir, run_directory = _prepare_job(tmp_path, cached=False)

    assert _run_train_job(data_dir, run_directory) == 1

    error = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert error["message"].startswith("Could not download yolo26n.pt.")
    assert "train" not in calls


def test_train_job_refuses_names_outside_the_official_list(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    _install_stub_ultralytics(monkeypatch, calls)
    data_dir, run_directory = _prepare_job(tmp_path, cached=False, name="../../evil")

    assert _run_train_job(data_dir, run_directory) == 1

    error = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert error["type"] == "ValueError"
    assert "YOLO" not in calls and "download" not in calls
