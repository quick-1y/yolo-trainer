"""`train_job` against the real Ultralytics: analytics off, download failure, and a real run.

The first two tests are fast and run by default. The last one trains for real on the CPU
(two epochs of yolo26n on twelve tiny images) and is behind the `training` marker:

    uv run pytest -m training backend/tests/test_train_job.py

It needs `yolo26n.pt` in the repository root (git-ignored) or internet access (MODL-01,
MODL-03, T4-05-05).
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel
from yolo_trainer_api.settings import Settings
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_common.progress import map50_key
from yolo_trainer_worker import queue, train_job
from yolo_trainer_worker.supervisor import Supervisor

from .training_helpers import setup_project, start_run, wait_status, worker_settings

REPO_ROOT = Path(__file__).resolve().parents[2]
TRAINING_TIMEOUT_SECONDS = 900


def test_the_isolated_ultralytics_settings_file_has_analytics_off(tmp_path: Path) -> None:
    pytest.importorskip("ultralytics")
    config_dir = tmp_path / "worker" / "ultralytics"
    config_dir.mkdir(parents=True)  # the supervisor creates it; Ultralytics needs it to exist
    code = (
        "from pathlib import Path; "
        "from yolo_trainer_worker.train_job import configure_ultralytics; "
        f"configure_ultralytics(Path({str(tmp_path / 'data')!r}))"
    )

    completed = subprocess.run(
        [sys.executable, "-c", code],
        env={**_clean_env(), "YOLO_CONFIG_DIR": str(config_dir)},
        capture_output=True,
        text=True,
        timeout=180,
    )

    assert completed.returncode == 0, completed.stderr
    settings_files = list(config_dir.rglob("settings.json"))  # <dir>/Ultralytics/settings.json
    assert settings_files, f"no settings file under {config_dir}"
    stored = json.loads(settings_files[0].read_text(encoding="utf-8"))
    assert stored["sync"] is False
    assert Path(stored["weights_dir"]) == layout.weights_root(tmp_path / "data")


def test_missing_official_weights_that_cannot_be_downloaded_fail_with_a_plain_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("ultralytics")
    import ultralytics.data.utils as ultralytics_data_utils
    import ultralytics.utils.downloads as ultralytics_downloads

    data_dir = tmp_path / "data"
    run_directory = layout.run_dir(data_dir, 3)
    run_directory.mkdir(parents=True)
    layout.write_json_atomic(
        run_directory / layout.JOB_FILE,
        {
            "schema_version": 1,
            "run_id": 3,
            "task_type": "detect",
            "base": {"kind": "official", "name": "yolo26n", "model_id": None},
            "settings": {"epochs": 1, "imgsz": 64, "batch": 2, "device": "cpu"},
        },
    )
    # No download happens, and the user's own Ultralytics settings are left alone.
    monkeypatch.setattr(ultralytics_downloads, "attempt_download_asset", lambda path: None)
    monkeypatch.setattr(train_job, "configure_ultralytics", lambda directory: None)
    monkeypatch.setattr(ultralytics_data_utils, "check_font", ultralytics_data_utils.check_font)

    exit_code = train_job.main(
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

    assert exit_code == 1
    error = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert error["message"] == (
        "Could not download yolo26n.pt. Check the internet access of the worker container, "
        f"or place the file in {layout.weights_root(data_dir)}/."
    )
    assert error["type"] == "WeightsDownloadError"
    assert error["category"] == "weights_download"


@pytest.mark.parametrize(
    ("raised", "category"),
    [
        (MemoryError("boom"), "out_of_memory"),
        (OSError(28, "No space left on device"), "disk_full"),
        (RuntimeError("Dataset 'x' error ❌ train: images not found"), "invalid_dataset"),
        (ValueError("something else"), "unknown"),
    ],
)
def test_main_writes_the_category_of_the_exception_next_to_its_type_and_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, raised: Exception, category: str
) -> None:
    run_directory = layout.run_dir(tmp_path / "data", 3)
    run_directory.mkdir(parents=True)

    def fail(args: object) -> None:
        raise raised

    monkeypatch.setattr(train_job, "_train", fail)

    exit_code = train_job.main(
        [
            "--run-dir",
            str(run_directory),
            "--data-dir",
            str(tmp_path / "data"),
            "--device",
            "cpu",
            "--batch",
            "2",
            "--workers",
            "0",
        ]
    )

    assert exit_code == 1
    error = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert error == {
        "type": type(raised).__name__,
        "message": str(raised),
        "category": category,
    }


class _Clock:
    """A fake monotonic clock: each call returns the next planned instant."""

    def __init__(self, *instants: float) -> None:
        self._instants = iter(instants)

    def __call__(self) -> float:
        return next(self._instants)


def _trainer(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "epochs": 3,
        "epoch": 0,
        "start_epoch": 0,
        "resume": False,
        "train_loader": [object()] * 4,
        "tloss": {"box_loss": 1.0},
        "metrics": {"metrics/mAP50(B)": 0.5},
        "fitness": 0.31,
        "stop": False,
        "best": "best.pt",
        "last": "last.pt",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _events(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def _run_batches(callbacks: dict, trainer: SimpleNamespace, count: int) -> None:
    for _ in range(count):
        callbacks["on_train_batch_end"](trainer)


def test_every_progress_line_carries_the_schema_version(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(train_job.ProgressWriter(path), clock=_Clock(0.0, 0.0))
    trainer = _trainer()

    callbacks["on_train_start"](trainer)
    callbacks["on_train_epoch_start"](trainer)
    callbacks["on_train_batch_end"](trainer)
    callbacks["on_train_epoch_end"](trainer)
    callbacks["on_fit_epoch_end"](trainer)
    callbacks["on_model_save"](trainer)
    callbacks["on_train_end"](trainer)

    events = _events(path)
    assert [event["event"] for event in events] == [
        "train_start",
        "batch_progress",
        "train_epoch_end",
        "fit_epoch_end",
        "model_save",
        "train_end",
    ]
    assert [event["v"] for event in events] == [2] * len(events)


def test_train_start_marks_the_segment_with_epochs_start_epoch_resume_and_batches(
    tmp_path: Path,
) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(train_job.ProgressWriter(path))

    callbacks["on_train_start"](_trainer())
    callbacks["on_train_start"](_trainer(start_epoch=2, resume=True))

    first, second = _events(path)
    assert (first["epochs"], first["start_epoch"], first["resumed"], first["nb"]) == (
        3,
        0,
        False,
        4,
    )
    assert (second["start_epoch"], second["resumed"]) == (2, True)


def test_batch_events_are_throttled_but_the_first_and_last_batch_always_get_one(
    tmp_path: Path,
) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(
        train_job.ProgressWriter(path), clock=_Clock(0.0, 0.5, 1.0, 1.5)
    )
    trainer = _trainer()

    callbacks["on_train_epoch_start"](trainer)
    _run_batches(callbacks, trainer, 4)

    events = _events(path)
    assert [(event["batch"], event["nb"], event["epoch"]) for event in events] == [
        (1, 4, 1),
        (4, 4, 1),
    ]
    assert train_job.BATCH_EVENT_MIN_INTERVAL == 2.0


def test_a_batch_event_is_written_once_the_interval_has_passed(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(
        train_job.ProgressWriter(path), clock=_Clock(0.0, 2.5, 5.0, 7.5)
    )
    trainer = _trainer()

    callbacks["on_train_epoch_start"](trainer)
    _run_batches(callbacks, trainer, 4)

    assert [event["batch"] for event in _events(path)] == [1, 2, 3, 4]


def test_a_batch_event_carries_no_loss_values(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(train_job.ProgressWriter(path), clock=_Clock(0.0))
    trainer = _trainer()

    callbacks["on_train_epoch_start"](trainer)
    callbacks["on_train_batch_end"](trainer)

    (event,) = _events(path)
    assert set(event) == {"event", "time", "v", "epoch", "epochs", "batch", "nb"}


def test_the_batch_counter_restarts_with_every_epoch(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(
        train_job.ProgressWriter(path), clock=_Clock(0.0, 0.1, 0.2, 0.3, 0.4)
    )

    callbacks["on_train_epoch_start"](_trainer(epoch=0))
    _run_batches(callbacks, _trainer(epoch=0), 4)
    callbacks["on_train_epoch_start"](_trainer(epoch=1))
    callbacks["on_train_batch_end"](_trainer(epoch=1))

    assert [(event["epoch"], event["batch"]) for event in _events(path)] == [
        (1, 1),
        (1, 4),
        (2, 1),
    ]


def test_a_single_batch_epoch_reports_batch_one_of_one(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(train_job.ProgressWriter(path), clock=_Clock(0.0))
    trainer = _trainer(train_loader=[object()])

    callbacks["on_train_epoch_start"](trainer)
    callbacks["on_train_batch_end"](trainer)

    (event,) = _events(path)
    assert (event["batch"], event["nb"]) == (1, 1)


def test_a_real_epoch_reports_fitness_and_whether_it_is_the_last_one(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(train_job.ProgressWriter(path))

    callbacks["on_train_epoch_end"](_trainer(epoch=0))
    callbacks["on_fit_epoch_end"](_trainer(epoch=0, stop=False))
    callbacks["on_train_epoch_end"](_trainer(epoch=1))
    callbacks["on_fit_epoch_end"](_trainer(epoch=1, stop=True))

    _, first, _, last = _events(path)
    assert (first["last_epoch"], first["fitness"], first["final_validation"]) == (
        False,
        0.31,
        False,
    )
    assert (last["last_epoch"], last["final_validation"], last["epoch"]) == (True, False, 2)


def test_the_post_training_validation_is_the_final_one_without_fitness(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    callbacks = train_job.make_callbacks(train_job.ProgressWriter(path))
    trainer = _trainer(epoch=1, stop=True)

    callbacks["on_train_epoch_end"](trainer)
    callbacks["on_fit_epoch_end"](trainer)
    callbacks["on_fit_epoch_end"](trainer)  # fires again after training, with no epoch before it

    final = _events(path)[-1]
    assert final["final_validation"] is True
    assert final["epoch"] == 2
    assert "fitness" not in final
    assert "last_epoch" not in final
    assert callbacks.state["final_metrics"] == {"metrics/mAP50(B)": 0.5}
    assert callbacks.state["last_epoch"] == 2


@pytest.mark.training
def test_a_real_two_epoch_cpu_run_registers_a_model_a_plain_script_can_load(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    _provide_base_weights(settings.data_dir)
    ids = setup_project(client, "Real training", train=8, valid=4, size=(64, 64))
    run = start_run(client, ids["project_id"], epochs=2, imgsz=64, batch=4, device="cpu")
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        tick_seconds=0.2,
    )
    assert queue.claim_next(engine) == run["id"]
    stop_event = threading.Event()
    watchdog = threading.Timer(TRAINING_TIMEOUT_SECONDS, stop_event.set)
    watchdog.daemon = True
    watchdog.start()

    try:
        outcome = supervisor.run_claimed(run["id"], stop_event)
    finally:
        watchdog.cancel()

    finished = client.get(f"/api/projects/{ids['project_id']}/runs/{run['id']}").json()
    assert outcome == "completed", finished.get("error_message")
    assert finished["status"] == "completed"
    assert (finished["epoch"], finished["epochs"]) == (2, 2)  # never 3: the final validation

    run_directory = layout.run_dir(settings.data_dir, run["id"])
    events = [
        json.loads(line)
        for line in (run_directory / layout.PROGRESS_FILE).read_text(encoding="utf-8").splitlines()
    ]
    fits = [event for event in events if event["event"] == "fit_epoch_end"]
    assert [event["final_validation"] for event in fits] == [False, False, True]
    assert [event["epoch"] for event in fits] == [1, 2, 2]
    assert [event["v"] for event in events] == [2] * len(events)
    assert [event["event"] for event in events].count("train_start") == 1
    batches = [event for event in events if event["event"] == "batch_progress"]
    assert {event["epoch"] for event in batches} == {1, 2}  # at least one per epoch
    assert fits[1]["last_epoch"] is True and "last_epoch" not in fits[2]
    assert finished["map50"] == fits[-1]["metrics"].get(map50_key("detect"))

    with Session(engine) as session:
        (model,) = session.scalars(select(TrainedModel)).all()  # best.pt only, never last.pt
        assert model.class_names == ["box"]
        assert model.task_type == "detect"
        model_path = layout.model_file(settings.data_dir, model.id)
        assert model_path.stat().st_size == model.size_bytes
    assert [path.name for path in layout.models_root(settings.data_dir).iterdir()] == [
        model_path.name
    ]
    sample_image = next(
        (layout.dataset_dir(settings.data_dir, run["id"]) / "train/images").iterdir()
    )

    probe = (
        "from ultralytics import settings; settings.update({'sync': False}); "
        "from ultralytics import YOLO; "
        f"m = YOLO({str(model_path)!r}); "
        "print(m.task); print(list(m.names.values())); "
        f"m.predict({str(sample_image)!r}, imgsz=64, verbose=False); "
        "print('PREDICT_OK')"
    )
    probe_config = tmp_path / "probe-config"
    probe_config.mkdir()  # Ultralytics needs it to exist, else it warns and creates ./Ultralytics
    loaded = subprocess.run(
        [sys.executable, "-c", probe],
        env={**_clean_env(), "YOLO_CONFIG_DIR": str(probe_config)},
        capture_output=True,
        text=True,
        timeout=300,
    )

    assert loaded.returncode == 0, loaded.stderr
    # Ultralytics prints a one-time "Creating new Ultralytics Settings" notice first;
    # the probe's own three lines are always the last ones.
    assert loaded.stdout.split()[-3:] == ["detect", "['box']", "PREDICT_OK"]


def _clean_env() -> dict[str, str]:
    return {key: value for key, value in os.environ.items() if key != "YOLO_CONFIG_DIR"}


def _provide_base_weights(data_dir: Path) -> None:
    """Put yolo26n.pt into the weights cache, or skip when it cannot be had."""
    local = REPO_ROOT / "yolo26n.pt"
    if local.is_file():
        target = layout.weights_file(data_dir, "yolo26n")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local, target)
        return
    try:
        socket.create_connection(("github.com", 443), timeout=3).close()
    except OSError:
        pytest.skip("yolo26n.pt is not in the repository root and github.com is unreachable")
