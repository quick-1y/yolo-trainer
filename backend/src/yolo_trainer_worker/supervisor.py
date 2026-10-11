"""Supervises one training subprocess at a time and writes its progress to the database.

The worker service polls the database, claims the oldest queued run and runs
`python -m yolo_trainer_worker.train_job` as a child process (argument list, no
shell). The child never opens the database: it writes `progress.jsonl`,
`result.json` / `error.json` and a log; this class tails those files and is the
single writer of run state (D-11, D-12, D-13, D-15, D-16).
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from sqlalchemy import Engine
from sqlalchemy.exc import OperationalError

from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_common.failures import (
    INVALID_DATASET,
    classify_exception,
    classify_exit,
    normalize_category,
)
from yolo_trainer_common.progress import (
    EVENT_FIT_EPOCH_END,
    EVENT_MODEL_SAVE,
    EVENT_TRAIN_START,
    ProgressTail,
    clean_log_tail,
    map50_key,
)
from yolo_trainer_worker import queue

if TYPE_CHECKING:
    from yolo_trainer_worker.main import WorkerSettings

logger = logging.getLogger(__name__)

CPU_BATCH_FALLBACK = 16
MAX_GPU_WORKERS = 8
TERMINATE_GRACE_SECONDS = 10
LOG_TAIL_BYTES = 64 * 1024

DATASET_MISSING_MESSAGE = "The prepared dataset is missing."
CLASS_MISMATCH_MESSAGE = "The trained model's class names do not match the dataset."
STOPPED_MESSAGE = "The worker was stopped while this run was in progress."

# Returned by `run_claimed` when the run row was deleted (or is no longer `running`) while
# the child trained: the child is stopped and nothing is written to the database.
VANISHED = "vanished"

# Returned by `run_claimed` when the user cancelled the run and the child was stopped (D-07).
CANCELLED = "cancelled"


@dataclass(frozen=True)
class Resolved:
    """What an `auto` request turned into on this host (D-09)."""

    device: str
    batch: int
    workers: int


def resolve_settings(settings: dict, device: ComputeDevice, cpu_count: int) -> Resolved:
    """Device "auto" -> GPU 0 when CUDA exists, else cpu; batch -1 -> 16 on CPU;
    workers 0 on CPU (Ultralytics forces it) and `min(8, cpu_count)` on GPU."""
    requested = settings.get("device", "auto")
    if requested == "auto":
        chosen = "0" if device.cuda_available else "cpu"
    else:
        chosen = str(requested)
    on_gpu = chosen != "cpu"
    batch = int(settings["batch"])
    if batch == -1 and not on_gpu:
        batch = CPU_BATCH_FALLBACK
    workers = min(MAX_GPU_WORKERS, max(1, cpu_count)) if on_gpu else 0
    return Resolved(device=chosen, batch=batch, workers=workers)


def default_command(
    run_directory: Path, data_dir: Path, resolved: Resolved, *, resume: bool = False
) -> list[str]:
    """The training command line: an argument list, built from validated values only (T4-02).

    `resume` appends `--resume`: the job continues from the run's own `last.pt` (D-09).
    """
    command = [
        sys.executable,
        "-m",
        "yolo_trainer_worker.train_job",
        "--run-dir",
        str(run_directory),
        "--data-dir",
        str(data_dir),
        "--device",
        resolved.device,
        "--batch",
        str(resolved.batch),
        "--workers",
        str(resolved.workers),
    ]
    if resume:
        command.append("--resume")
    return command


class CommandBuilder(Protocol):
    """Builds the training command; `resume` is True for every segment after the first."""

    def __call__(
        self, run_directory: Path, data_dir: Path, resolved: Resolved, *, resume: bool = False
    ) -> list[str]: ...


def _read_log_tail(path: Path) -> str:
    """The cleaned last lines of the run log (the last 64 KiB are read)."""
    try:
        with path.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            handle.seek(max(0, size - LOG_TAIL_BYTES))
            raw = handle.read()
    except OSError:
        return ""
    return clean_log_tail(raw.decode("utf-8", errors="replace"))


def _classify(exc: BaseException) -> str:
    """The failure category of an exception the supervisor itself caught."""
    return classify_exception(type(exc).__name__, str(exc), getattr(exc, "errno", None))


def _read_error_file(path: Path) -> tuple[str | None, str | None]:
    """`(message, category)` from the child's `error.json`; each is None when absent or unusable.

    The file is written by the child process, so the category is checked against the allow-list
    before anything is stored: a value outside it becomes `unknown` (T-05-11).
    """
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, None
    if not isinstance(payload, dict):
        return None, None
    message = payload.get("message")
    category = payload.get("category")
    return (
        message if isinstance(message, str) and message.strip() else None,
        normalize_category(category) if category is not None else None,
    )


class Supervisor:
    """Claims queued runs and drives their training subprocess to a final status."""

    def __init__(
        self,
        engine: Engine,
        settings: WorkerSettings,
        device: ComputeDevice,
        command: CommandBuilder = default_command,
        tick_seconds: float = 1.0,
    ) -> None:
        self.engine = engine
        self.settings = settings
        self.device = device
        self.command = command
        self.tick_seconds = tick_seconds
        self.active_run_id: int | None = None
        # The open running segment of the claimed run, on the monotonic clock (D-09): when the
        # child was started and the seconds banked by the earlier segments of the run.
        self._segment_start: float | None = None
        self._base_active = 0.0

    def _active_total(self) -> float | None:
        """Banked seconds plus the open segment; None while no child has been started.

        Measured here on `time.monotonic()`, never from wall-clock stamps or SQL date functions,
        so a clock change cannot bend a duration (Pitfall 7).
        """
        if self._segment_start is None:
            return None
        return self._base_active + (time.monotonic() - self._segment_start)

    def serve(self, stop_event: threading.Event) -> None:
        """Reconcile once, then claim and run queued runs until `stop_event` is set."""
        poll = self.settings.poll_interval_seconds
        while not stop_event.is_set():
            try:
                swept = queue.reconcile_on_start(self.engine)
            except OperationalError:
                # The api may not have migrated yet (Pitfall 9); try again shortly.
                logger.warning("Run table not ready; retrying", exc_info=True)
                stop_event.wait(poll)
                continue
            if swept:
                logger.warning("Ended %s run(s) that a restart left running", swept)
            break

        while not stop_event.is_set():
            try:
                run_id = queue.claim_next(self.engine)
            except OperationalError:
                logger.warning("Could not poll the run queue; retrying", exc_info=True)
                stop_event.wait(poll)
                continue
            if run_id is None:
                stop_event.wait(poll)
                continue
            try:
                self.run_claimed(run_id, stop_event)
            except Exception:
                logger.exception("Supervising run %s failed unexpectedly", run_id)
                try:
                    queue.mark_failed(
                        self.engine,
                        run_id,
                        "The worker failed while supervising this run.",
                        None,
                        active_seconds=self._active_total(),
                    )
                except Exception:
                    logger.exception("Could not mark run %s as failed", run_id)

    def run_claimed(self, run_id: int, stop_event: threading.Event) -> str:
        """Run one claimed run to its end; returns the final status."""
        self.active_run_id = run_id
        self._segment_start = None
        self._base_active = 0.0
        try:
            return self._run(run_id, stop_event)
        finally:
            self.active_run_id = None

    def _run(self, run_id: int, stop_event: threading.Event) -> str:
        data_dir = self.settings.data_dir
        run_directory = layout.run_dir(data_dir, run_id)
        run = queue.load_run(self.engine, run_id)
        if run is None:
            return VANISHED
        if not (run_directory / layout.JOB_FILE).is_file():
            queue.mark_failed(self.engine, run_id, DATASET_MISSING_MESSAGE, None, INVALID_DATASET)
            return "failed"

        resuming = run["resume_count"] > 0
        resolved = self._resolved_for(run, resuming)
        layout.write_json_atomic(run_directory / layout.RESOLVED_FILE, asdict(resolved))
        if resuming:
            # The previous attempt's verdict files must not be mistaken for this segment's.
            (run_directory / layout.ERROR_FILE).unlink(missing_ok=True)
            (run_directory / layout.RESULT_FILE).unlink(missing_ok=True)
        layout.ultralytics_config_dir(data_dir).mkdir(parents=True, exist_ok=True)
        log_path = run_directory / layout.LOG_FILE
        env = {
            **os.environ,
            "PYTHONUNBUFFERED": "1",
            "PYTHONUTF8": "1",
            "YOLO_AUTOINSTALL": "false",
            "YOLO_CONFIG_DIR": str(layout.ultralytics_config_dir(data_dir)),
        }
        popen_options: dict[str, object] = {}
        if os.name == "posix":
            popen_options["start_new_session"] = True
        else:
            popen_options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        with log_path.open("ab") as log:
            try:
                process = subprocess.Popen(
                    self.command(run_directory, data_dir, resolved, resume=resuming),
                    cwd=run_directory,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    env=env,
                    **popen_options,
                )
            except OSError as exc:
                queue.mark_failed(
                    self.engine,
                    run_id,
                    f"Could not start the training process: {exc}",
                    None,
                    _classify(exc),
                )
                return "failed"
            # The running segment starts with the child; what waited in the queue never counts.
            self._base_active = float(run.get("active_seconds") or 0.0)
            self._segment_start = time.monotonic()
            try:
                queue.record_start(self.engine, run_id, asdict(resolved), process.pid)
                outcome, final_metrics = self._watch(
                    run_id, run, process, run_directory, stop_event, resuming
                )
            except BaseException:
                # Whatever went wrong here, never leave the child training unsupervised.
                self._terminate(process)
                raise
        if outcome is not None:
            return outcome
        return self._finish(run_id, run, process.returncode, run_directory, final_metrics)

    def _resolved_for(self, run: dict, resuming: bool) -> Resolved:
        """What this segment runs with: the stored resolution on a resume, else a fresh one.

        A resumed segment reuses the device, batch and workers stored for the run, never the
        request again: settings cannot change on resume, even when the host did (D-11).
        """
        stored = run.get("resolved")
        if resuming and isinstance(stored, dict):
            try:
                return Resolved(**stored)
            except TypeError:
                logger.warning("Run %s has an unusable stored resolution", run["id"])
        return resolve_settings(run["settings"], self.device, os.cpu_count() or 1)

    def _record_checkpoint(self, run_id: int, resume_epoch: int | None) -> None:
        try:
            queue.record_checkpoint(self.engine, run_id, resume_epoch)
        except OperationalError:
            # A busy database must not kill a long training; the next checkpoint event retries.
            logger.warning("Could not record the checkpoint of run %s", run_id, exc_info=True)

    # -- watching ---------------------------------------------------------

    def _watch(
        self,
        run_id: int,
        run: dict,
        process: subprocess.Popen,
        run_directory: Path,
        stop_event: threading.Event,
        resuming: bool = False,
    ) -> tuple[str | None, dict]:
        """Tail the child's progress until it exits.

        Returns `(outcome, metrics)`: a non-None outcome ends the run early; `metrics` are the
        final-validation metrics, or the last real epoch's when no final event arrived. A resumed
        segment starts reading at the end of the file: the earlier segments' events were handled
        when they happened and must not be written to the database again.
        """
        tail = ProgressTail()
        progress_path = run_directory / layout.PROGRESS_FILE
        if resuming:
            try:
                tail.offset = progress_path.stat().st_size
            except OSError:
                tail.offset = 0
        key = map50_key(run["task_type"])
        last_real: dict = {}
        final: dict = {}
        outcome: str | None = None
        planned = run.get("epochs")
        loop_over = False
        while True:
            exit_code = process.poll()
            for event in tail.read_new_events(progress_path):
                kind = event.get("event")
                if kind == EVENT_TRAIN_START:
                    # A segment opens. A resumed one names the epoch the worker really loaded from
                    # the checkpoint, which also corrects a derived or unknown value (Phase 4 rows).
                    loop_over = False
                    epochs = event.get("epochs")
                    if isinstance(epochs, int) and not isinstance(epochs, bool):
                        planned = epochs
                    start = event.get("start_epoch")
                    if (
                        event.get("resumed") is True
                        and isinstance(start, int)
                        and not isinstance(start, bool)
                        and start > 0
                    ):
                        self._record_checkpoint(run_id, start)
                    continue
                if kind == EVENT_MODEL_SAVE:
                    # A save below the planned total is a checkpoint a resume can continue from;
                    # the last epoch's is stripped by Ultralytics, and nothing counts once the loop
                    # is over.
                    saved = event.get("epoch")
                    if (
                        isinstance(saved, int)
                        and not isinstance(saved, bool)
                        and not loop_over
                        and (planned is None or saved < planned)
                    ):
                        self._record_checkpoint(run_id, saved)
                    continue
                if kind != EVENT_FIT_EPOCH_END:
                    continue
                metrics = event.get("metrics") or {}
                if event.get("final_validation"):
                    # The post-training validation of best.pt: never an epoch (D-12).
                    final = metrics
                    continue
                last_real = metrics
                if event.get("last_epoch") is True:
                    # The loop is over: final_eval is about to strip last.pt (Pitfall 3).
                    loop_over = True
                    self._record_checkpoint(run_id, None)
                value = metrics.get(key)
                try:
                    changed = queue.record_epoch(
                        self.engine,
                        run_id,
                        int(event.get("epoch", 0)),
                        event.get("epochs") or run.get("epochs"),
                        value if isinstance(value, int | float) else None,
                    )
                except OperationalError:
                    # A busy database must not kill a long training; the next epoch retries.
                    logger.warning("Could not record progress of run %s", run_id, exc_info=True)
                    continue
                if changed == 0 and exit_code is None:
                    # The run row is gone or no longer running: stop the child.
                    self._terminate(process)
                    outcome = VANISHED
            if outcome is None and exit_code is None:
                status, cancel_requested_at = self._control(run_id)
                if status != "running":
                    # The row can disappear between epochs (project deleted): no event reveals it.
                    self._terminate(process)
                    outcome = VANISHED
                elif cancel_requested_at is not None and process.poll() is None:
                    # The user asked for a cancel (D-07). This is only reached while the child is
                    # alive: a child that already exited on its own is finished normally below.
                    # `_terminate` returns once the child is dead, so the serve loop can never
                    # claim the next run while this trainer is still dying. A cancel is not a
                    # failure: the exit code is not classified and no model is registered (D-08).
                    active = self._active_total()
                    self._terminate(process)
                    changed = queue.mark_cancelled(
                        self.engine,
                        run_id,
                        _read_log_tail(run_directory / layout.LOG_FILE),
                        active_seconds=active,
                    )
                    outcome = CANCELLED if changed else VANISHED
            if outcome is not None or exit_code is not None:
                break
            if stop_event.is_set():
                active = self._active_total()
                self._terminate(process)
                queue.mark_interrupted(
                    self.engine,
                    run_id,
                    STOPPED_MESSAGE,
                    _read_log_tail(run_directory / layout.LOG_FILE),
                    active_seconds=active,
                )
                outcome = "interrupted"
                break
            stop_event.wait(self.tick_seconds)
        if outcome is None and self._control(run_id)[0] != "running":
            outcome = VANISHED
        return outcome, final or last_real

    def _control(self, run_id: int) -> tuple[str | None, datetime | None]:
        """`(status, cancel_requested_at)` of the run; a busy database counts as still running."""
        try:
            return queue.run_control(self.engine, run_id)
        except OperationalError:
            logger.warning("Could not check run %s; assuming it is still running", run_id)
            return "running", None

    @staticmethod
    def _terminate(process: subprocess.Popen) -> None:
        """Stop the child and its group: SIGTERM, a grace period, then SIGKILL."""
        if process.poll() is not None:
            return
        try:
            if os.name == "posix":
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            else:
                process.terminate()
        except (ProcessLookupError, PermissionError):
            pass
        try:
            process.wait(timeout=TERMINATE_GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            try:
                if os.name == "posix":
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                else:
                    process.kill()
            except (ProcessLookupError, PermissionError):
                pass
            process.wait()

    # -- finishing --------------------------------------------------------

    def _finish(
        self,
        run_id: int,
        run: dict,
        exit_code: int,
        run_directory: Path,
        final_metrics: dict,
    ) -> str:
        log_tail = _read_log_tail(run_directory / layout.LOG_FILE)
        active = self._active_total()
        result_path = run_directory / layout.RESULT_FILE
        best = layout.best_weights(run_directory)
        if exit_code == 0 and result_path.is_file() and best.is_file():
            try:
                result = json.loads(result_path.read_text(encoding="utf-8"))
                if result.get("names") != run["class_names"]:
                    queue.mark_failed(
                        self.engine,
                        run_id,
                        CLASS_MISMATCH_MESSAGE,
                        log_tail,
                        active_seconds=active,
                    )
                    return "failed"
                queue.register_model(
                    self.engine,
                    self.settings.data_dir,
                    run_id,
                    result,
                    final_metrics,
                    active_seconds=active,
                )
            except Exception as exc:
                logger.exception("Could not register the model of run %s", run_id)
                queue.mark_failed(
                    self.engine,
                    run_id,
                    f"Could not register the trained model: {exc}",
                    log_tail,
                    _classify(exc),
                    active_seconds=active,
                )
                return "failed"
            return "completed"

        message, category = _read_error_file(run_directory / layout.ERROR_FILE)
        if message is None:
            if exit_code == 0:
                message = "The training process finished without producing a model."
            else:
                message = f"The training process exited with code {exit_code}."
        if category is None:
            # A hard crash or an OS kill leaves no error file (or an old one without a category).
            category = classify_exit(exit_code, log_tail)
        queue.mark_failed(self.engine, run_id, message, log_tail, category, active_seconds=active)
        return "failed"
