"""`train_job` against the real Ultralytics: analytics off, download failure, and a real run.

The first two tests are fast and run by default. The last one trains for real on the CPU
(two epochs of yolo26n on twelve tiny images) and is behind the `training` marker:

    uv run pytest -m training backend/tests/test_train_job.py

It needs `yolo26n.pt` in the repository root (git-ignored) or internet access (MODL-01,
MODL-03, T4-05-05).
"""

from __future__ import annotations

import hashlib
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
from sqlalchemy import Engine, select, update
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel, TrainingRun, utcnow
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_common.progress import ProgressTail, map50_key
from yolo_trainer_worker import queue, train_job
from yolo_trainer_worker.supervisor import Supervisor

from .test_worker_supervisor import _wait_until
from .training_helpers import XHR, setup_project, start_run, wait_status, worker_settings

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


# -- resume (TRAN-07, D-09..D-11): a validated checkpoint, a pinned folder, a repaired file --------

OPTIMIZER_STATE = {"state": {}, "param_groups": []}


@pytest.mark.parametrize(
    "ckpt",
    [
        {"epoch": 1, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 4}},
        {"epoch": 0, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 2}},
    ],
)
def test_a_checkpoint_with_training_state_and_epochs_left_can_be_resumed(ckpt: dict) -> None:
    train_job.check_resumable(ckpt)  # does not raise


@pytest.mark.parametrize(
    ("ckpt", "message"),
    [
        (
            {"epoch": -1, "optimizer": None, "train_args": {"epochs": 4}},
            "The checkpoint has no training state (training had already finished).",
        ),
        (
            {"epoch": 2, "optimizer": None, "train_args": {"epochs": 4}},
            "The checkpoint has no training state (training had already finished).",
        ),
        (
            {"epoch": -1, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 4}},
            "The checkpoint has no training state (training had already finished).",
        ),
        ({}, "The checkpoint has no training state (training had already finished)."),
        (
            {"epoch": 3, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 4}},
            "All epochs were already trained; nothing is left to resume.",
        ),
        (
            {"epoch": 9, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 4}},
            "All epochs were already trained; nothing is left to resume.",
        ),
    ],
)
def test_a_checkpoint_without_training_state_or_without_epochs_left_is_refused(
    ckpt: dict, message: str
) -> None:
    with pytest.raises(train_job.NotResumableError) as raised:
        train_job.check_resumable(ckpt)

    assert str(raised.value) == message


def test_the_resume_errors_are_runtime_errors_the_classifier_files_under_not_resumable() -> None:
    from yolo_trainer_common.failures import classify_exception

    assert issubclass(train_job.NotResumableError, RuntimeError)
    assert issubclass(train_job.CheckpointError, RuntimeError)
    for error in (train_job.NotResumableError, train_job.CheckpointError):
        assert classify_exception(error.__name__, "x") == "not_resumable"


def test_ensure_line_boundary_terminates_a_half_line_so_the_next_event_is_not_lost(
    tmp_path: Path,
) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_text('{"event": "train_epoch_end", "epoch": 1}\n{"event": "fit_ep', encoding="utf-8")
    writer = train_job.ProgressWriter(path)

    writer.ensure_line_boundary()
    writer.emit("train_start", epochs=4, start_epoch=1, resumed=True, nb=4)

    events = ProgressTail().read_new_events(path)
    assert [event["event"] for event in events] == ["train_epoch_end", "train_start"]
    assert events[-1]["resumed"] is True and events[-1]["start_epoch"] == 1


def test_without_the_repair_a_killed_half_line_swallows_the_next_event(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_text('{"event": "fit_ep', encoding="utf-8")

    train_job.ProgressWriter(path).emit("train_start", epochs=4, start_epoch=1, resumed=True, nb=4)

    assert ProgressTail().read_new_events(path) == []  # the reason ensure_line_boundary exists


def test_ensure_line_boundary_writes_nothing_for_a_clean_empty_or_missing_file(
    tmp_path: Path,
) -> None:
    clean = tmp_path / "clean.jsonl"
    clean.write_bytes(b'{"event": "train_start"}\n')
    empty = tmp_path / "empty.jsonl"
    empty.write_bytes(b"")
    missing = tmp_path / "missing.jsonl"

    for path in (clean, empty, missing):
        train_job.ProgressWriter(path).ensure_line_boundary()

    assert clean.read_bytes() == b'{"event": "train_start"}\n'
    assert empty.read_bytes() == b""
    assert not missing.exists()  # the repair never creates the file


def test_the_base_record_keeps_the_name_and_hash_so_a_resume_never_needs_the_base_file(
    tmp_path: Path,
) -> None:
    run_directory = tmp_path / "runs" / "3"
    run_directory.mkdir(parents=True)
    weights = tmp_path / "weights.pt"
    weights.write_bytes(b"base weights")
    job = {"base": {"kind": "official", "name": "yolo26n"}}

    written = train_job._write_base_record(run_directory, job, weights)
    weights.unlink()  # a deleted base model no longer matters

    stored = json.loads((run_directory / layout.BASE_FILE).read_text(encoding="utf-8"))
    assert stored == written == {"name": "yolo26n", "sha256": _digest(b"base weights")}
    assert train_job._read_base_record(run_directory, job) == stored


def test_a_run_without_a_base_record_falls_back_to_the_name_without_a_hash(tmp_path: Path) -> None:
    job = {"base": {"kind": "model", "name": "best-cars", "model_id": 4}}

    assert train_job._read_base_record(tmp_path, job) == {"name": "best-cars", "sha256": None}
    (tmp_path / layout.BASE_FILE).write_text("not json", encoding="utf-8")
    assert train_job._read_base_record(tmp_path, job) == {"name": "best-cars", "sha256": None}


def test_the_base_file_name_is_part_of_the_on_disk_contract() -> None:
    assert layout.BASE_FILE == "base.json"


def _resume_argv(run_directory: Path, data_dir: Path, *extra: str) -> list[str]:
    return [
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
        *extra,
    ]


def test_the_resume_flag_is_parsed_and_defaults_to_a_fresh_start(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[bool] = []
    monkeypatch.setattr(train_job, "_train", lambda args: seen.append(args.resume))

    assert train_job.main(_resume_argv(tmp_path, tmp_path)) == 0
    assert train_job.main(_resume_argv(tmp_path, tmp_path, "--resume")) == 0

    assert seen == [False, True]


@pytest.mark.parametrize("error_name", ["NotResumableError", "CheckpointError"])
def test_a_refused_checkpoint_fails_the_run_as_not_resumable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, error_name: str
) -> None:
    error = getattr(train_job, error_name)
    run_directory = layout.run_dir(tmp_path / "data", 3)
    run_directory.mkdir(parents=True)

    def refuse(args: object) -> None:
        raise error("Refused.")

    monkeypatch.setattr(train_job, "_train", refuse)

    exit_code = train_job.main(_resume_argv(run_directory, tmp_path / "data", "--resume"))

    assert exit_code == 1
    written = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert written == {"type": error.__name__, "message": "Refused.", "category": "not_resumable"}


class _StubYolo:
    """A stand-in for `ultralytics.YOLO` that records what the resume path does with it."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch, ckpt: object) -> None:
        import ultralytics
        import ultralytics.data.utils as ultralytics_data_utils

        self.loaded: list[str] = []
        self.callbacks: list[str] = []
        self.trained: list[dict] = []
        stub = self

        class Model:
            names = {0: "box"}
            task = "detect"

            def __init__(self, path: str) -> None:
                stub.loaded.append(path)
                if isinstance(ckpt, Exception):
                    raise ckpt
                self.ckpt = ckpt

            def add_callback(self, name: str, callback: object) -> None:
                stub.callbacks.append(name)

            def train(self, **kwargs: object) -> None:
                stub.trained.append(kwargs)

        monkeypatch.setattr(ultralytics, "YOLO", Model)
        monkeypatch.setattr(train_job, "configure_ultralytics", lambda directory: None)
        monkeypatch.setattr(ultralytics_data_utils, "check_font", ultralytics_data_utils.check_font)


def _resumable_run(tmp_path: Path, *, with_last: bool = True) -> tuple[Path, Path]:
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
            "settings": {"epochs": 4, "imgsz": 64, "batch": 2, "device": "cpu"},
        },
    )
    if with_last:
        last = layout.last_weights(run_directory)
        last.parent.mkdir(parents=True)
        last.write_bytes(b"checkpoint")
    return data_dir, run_directory


def test_the_resume_path_trains_from_the_checkpoint_with_the_folder_pinned(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("ultralytics")
    data_dir, run_directory = _resumable_run(tmp_path)
    ckpt = {"epoch": 1, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 4}}
    stub = _StubYolo(monkeypatch, ckpt)
    layout.write_json_atomic(
        run_directory / layout.BASE_FILE, {"name": "yolo26n", "sha256": "ab" * 32}
    )
    progress = run_directory / layout.PROGRESS_FILE
    progress.write_text('{"event": "fit_ep', encoding="utf-8")  # a kill left half a line

    def never_resolved(*args: object, **kwargs: object) -> None:
        raise AssertionError("a resume must not look for the base weights")

    monkeypatch.setattr(train_job, "_resolve_weights", never_resolved)

    exit_code = train_job.main(_resume_argv(run_directory, data_dir, "--resume"))

    assert exit_code == 0, (run_directory / layout.ERROR_FILE).read_text(encoding="utf-8")
    assert stub.loaded == [str(layout.last_weights(run_directory))]
    assert len(stub.trained) == 1
    trained = stub.trained[0]
    assert trained["resume"] is True
    # Pitfall 2: the checkpoint pins an absolute save_dir; it is always overridden.
    assert trained["save_dir"] == str(run_directory / "out" / "train")
    assert trained["data"] == str(layout.dataset_dir(data_dir, 3) / layout.DATA_YAML)
    assert (trained["imgsz"], trained["batch"], trained["device"], trained["workers"]) == (
        64,
        2,
        "cpu",
        0,
    )
    assert "epochs" not in trained  # the checkpoint's own epochs and hyperparameters are used
    assert {"on_train_start", "on_fit_epoch_end", "on_model_save"} <= set(stub.callbacks)
    assert progress.read_bytes().endswith(b"\n")  # the half line was terminated
    result = json.loads((run_directory / layout.RESULT_FILE).read_text(encoding="utf-8"))
    assert result["base_weights"] == {"name": "yolo26n", "sha256": "ab" * 32}
    assert result["names"] == ["box"]


def test_a_resumed_result_without_a_base_record_keeps_the_name_and_no_hash(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("ultralytics")
    data_dir, run_directory = _resumable_run(tmp_path)
    _StubYolo(monkeypatch, {"epoch": 0, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 3}})

    assert train_job.main(_resume_argv(run_directory, data_dir, "--resume")) == 0

    result = json.loads((run_directory / layout.RESULT_FILE).read_text(encoding="utf-8"))
    assert result["base_weights"] == {"name": "yolo26n", "sha256": None}


@pytest.mark.parametrize(
    ("ckpt", "message"),
    [
        (
            {"epoch": -1, "optimizer": None, "train_args": {"epochs": 4}},
            "The checkpoint has no training state (training had already finished).",
        ),
        (
            {"epoch": 3, "optimizer": OPTIMIZER_STATE, "train_args": {"epochs": 4}},
            "All epochs were already trained; nothing is left to resume.",
        ),
    ],
)
def test_a_checkpoint_that_cannot_continue_never_starts_a_new_training(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, ckpt: dict, message: str
) -> None:
    pytest.importorskip("ultralytics")
    data_dir, run_directory = _resumable_run(tmp_path)
    stub = _StubYolo(monkeypatch, ckpt)

    exit_code = train_job.main(_resume_argv(run_directory, data_dir, "--resume"))

    assert exit_code == 1
    # Ultralytics would train from epoch 1 with exit 0 here (Pitfall 1): train() is never called.
    assert stub.trained == []
    written = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert (written["type"], written["category"], written["message"]) == (
        "NotResumableError",
        "not_resumable",
        message,
    )
    assert not (run_directory / layout.RESULT_FILE).exists()
    assert not (run_directory / layout.PROGRESS_FILE).exists()  # no event of a new segment


def test_a_missing_checkpoint_fails_before_anything_is_loaded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("ultralytics")
    data_dir, run_directory = _resumable_run(tmp_path, with_last=False)
    stub = _StubYolo(monkeypatch, {})

    exit_code = train_job.main(_resume_argv(run_directory, data_dir, "--resume"))

    assert exit_code == 1
    assert stub.loaded == [] and stub.trained == []
    written = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert (written["type"], written["category"]) == ("CheckpointError", "not_resumable")
    assert written["message"] == "The saved checkpoint is missing."


def test_an_unreadable_checkpoint_is_reported_as_damaged(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("ultralytics")
    data_dir, run_directory = _resumable_run(tmp_path)
    stub = _StubYolo(monkeypatch, RuntimeError("PytorchStreamReader failed reading zip archive"))

    exit_code = train_job.main(_resume_argv(run_directory, data_dir, "--resume"))

    assert exit_code == 1
    assert stub.trained == []
    written = json.loads((run_directory / layout.ERROR_FILE).read_text(encoding="utf-8"))
    assert (written["type"], written["category"]) == ("CheckpointError", "not_resumable")
    assert written["message"] == (
        "The saved checkpoint is damaged; start a new run from this run's interim model."
    )


def test_a_fresh_start_records_its_base_weights_for_a_later_resume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("ultralytics")
    data_dir, run_directory = _resumable_run(tmp_path, with_last=False)
    stub = _StubYolo(monkeypatch, {})
    weights = tmp_path / "base.pt"
    weights.write_bytes(b"base weights")
    monkeypatch.setattr(train_job, "_resolve_weights", lambda directory, base: weights)

    exit_code = train_job.main(_resume_argv(run_directory, data_dir))

    assert exit_code == 0, (run_directory / layout.ERROR_FILE).read_text(encoding="utf-8")
    assert stub.loaded == [str(weights)]
    (trained,) = stub.trained
    assert "resume" not in trained and trained["epochs"] == 4
    expected = {"name": "yolo26n", "sha256": _digest(b"base weights")}
    assert json.loads((run_directory / layout.BASE_FILE).read_text(encoding="utf-8")) == expected
    result = json.loads((run_directory / layout.RESULT_FILE).read_text(encoding="utf-8"))
    assert result["base_weights"] == expected


# -- real CPU runs: cancel, resume, and a checkpoint that cannot be resumed ------------------------


def _real_supervisor(settings: Settings) -> tuple[Supervisor, Engine]:
    engine = queue.create_worker_engine(worker_settings(settings))
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        tick_seconds=0.2,
    )
    return supervisor, engine


def _run_to_the_end(supervisor: Supervisor, run_id: int) -> str:
    """Run one claimed run synchronously; a watchdog stops it after the training timeout."""
    stop_event = threading.Event()
    watchdog = threading.Timer(TRAINING_TIMEOUT_SECONDS, stop_event.set)
    watchdog.daemon = True
    watchdog.start()
    try:
        return supervisor.run_claimed(run_id, stop_event)
    finally:
        watchdog.cancel()


def _events_of(settings: Settings, run_id: int) -> list[dict]:
    path = layout.run_dir(settings.data_dir, run_id) / layout.PROGRESS_FILE
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _post(client: TestClient, project_id: int, run_id: int, action: str):
    return client.post(f"/api/projects/{project_id}/runs/{run_id}/{action}", headers=XHR)


@pytest.mark.training
def test_a_real_run_cancelled_mid_training_resumes_from_its_checkpoint_and_completes(
    client: TestClient, settings: Settings
) -> None:
    _provide_base_weights(settings.data_dir)
    ids = setup_project(client, "Real resume", train=8, valid=4, size=(64, 64))
    project_id = ids["project_id"]
    # More epochs than the test needs, so the cancel always lands before the loop ends.
    run = start_run(client, project_id, epochs=6, imgsz=64, batch=4, device="cpu")
    run_id = run["id"]
    wait_status(client, project_id, run_id, {"queued"})
    supervisor, engine = _real_supervisor(settings)
    assert queue.claim_next(engine) == run_id
    first_segment = threading.Thread(
        target=lambda: supervisor.run_claimed(run_id, threading.Event()), daemon=True
    )
    first_segment.start()

    def checkpointed() -> bool:
        with Session(engine) as session:
            return (session.get(TrainingRun, run_id).resume_epoch or 0) >= 1

    _wait_until(checkpointed, timeout=TRAINING_TIMEOUT_SECONDS)
    assert _post(client, project_id, run_id, "cancel").status_code == 200
    first_segment.join(timeout=120)
    assert not first_segment.is_alive(), "the cancelled run did not stop"
    cancelled = wait_status(client, project_id, run_id, {"cancelled"})
    assert cancelled["can_resume"] is True
    saved = [e["epoch"] for e in _events_of(settings, run_id) if e["event"] == "model_save"]
    assert saved and max(saved) < 6
    run_directory = layout.run_dir(settings.data_dir, run_id)
    assert layout.last_weights(run_directory).is_file()

    resumed = _post(client, project_id, run_id, "resume")
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["status"] == "queued"
    assert queue.claim_next(engine) == run_id
    outcome = _run_to_the_end(supervisor, run_id)

    finished = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    assert outcome == "completed", finished.get("error_message")
    assert (finished["status"], finished["resume_count"], finished["epoch"]) == ("completed", 1, 6)
    assert finished["resume_epoch"] is None
    events = _events_of(settings, run_id)
    starts = [index for index, event in enumerate(events) if event["event"] == "train_start"]
    assert len(starts) == 2
    second = events[starts[1]]
    assert second["resumed"] is True
    # The segment continues from the checkpoint: its start epoch is the last saved epoch (a kill
    # between a save and its event may leave it one ahead of the last model_save).
    assert max(saved) <= second["start_epoch"] <= max(saved) + 1
    after = events[starts[1] :]
    first_epoch = next(e for e in after if e["event"] == "train_epoch_end")
    assert first_epoch["epoch"] == second["start_epoch"] + 1  # never 1
    finals = [e for e in events if e["event"] == "fit_epoch_end" and e["final_validation"]]
    assert len(finals) == 1
    for event in events:
        if event["event"] == "model_save":  # the checkpoint writes stay in the run's own folder
            assert Path(event["last"]).resolve().is_relative_to(run_directory.resolve())
    with Session(engine) as session:
        assert len(session.scalars(select(TrainedModel)).all()) == 1
    base = json.loads((run_directory / layout.BASE_FILE).read_text(encoding="utf-8"))
    assert base["name"] == "yolo26n" and len(base["sha256"]) == 64
    assert not (run_directory / layout.ERROR_FILE).exists()


@pytest.mark.training
def test_resuming_a_finished_runs_stripped_checkpoint_fails_honestly_without_retraining(
    client: TestClient, settings: Settings
) -> None:
    _provide_base_weights(settings.data_dir)
    ids = setup_project(client, "Real refusal", train=8, valid=4, size=(64, 64))
    project_id = ids["project_id"]
    run = start_run(client, project_id, epochs=2, imgsz=64, batch=4, device="cpu")
    run_id = run["id"]
    wait_status(client, project_id, run_id, {"queued"})
    supervisor, engine = _real_supervisor(settings)
    assert queue.claim_next(engine) == run_id
    assert _run_to_the_end(supervisor, run_id) == "completed"
    # Ultralytics stripped last.pt before the final validation; force the row back to a resumable
    # status with a stored epoch, the worst case for the api's own checks.
    with Session(engine) as session, session.begin():
        session.execute(
            update(TrainingRun)
            .where(TrainingRun.id == run_id)
            .values(status="failed", resume_epoch=1, error_message="forced", finished_at=utcnow())
        )
    progress = layout.run_dir(settings.data_dir, run_id) / layout.PROGRESS_FILE
    before = progress.read_bytes()

    assert _post(client, project_id, run_id, "resume").status_code == 200
    assert queue.claim_next(engine) == run_id
    outcome = _run_to_the_end(supervisor, run_id)

    refused = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
    assert outcome == "failed"
    assert (refused["status"], refused["error_category"]) == ("failed", "not_resumable")
    assert "no training state" in refused["error_message"]
    assert progress.read_bytes() == before  # no new train_start and no epoch of a new training
    assert refused["can_resume"] is False  # the refused checkpoint is not offered again
    again = _post(client, project_id, run_id, "resume")
    assert again.status_code == 409
    assert again.json()["detail"] == service.RUN_CHECKPOINT_NOT_RESUMABLE_DETAIL


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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
