"""Worker entrypoint: heartbeat file plus the DB-polled training runner (D-17, Phase 4).

The worker writes a heartbeat file under `DATA_DIR/worker/` at a fixed interval
(device and version info) from a background thread, while the main thread runs
the `Supervisor`: it polls the database for queued runs and trains them, one at
a time, in a subprocess inside this container (D-11).

`WorkerSettings` is intentionally separate from `yolo_trainer_api.settings.
Settings` so the worker does not depend on api configuration.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from types import FrameType
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice, detect_compute_device
from yolo_trainer_common.heartbeat import is_heartbeat_fresh

logger = logging.getLogger(__name__)


class WorkerSettings(BaseSettings):
    """Typed configuration for the worker process."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore", populate_by_name=True)

    data_dir: Path = Path("data")

    # env WORKER_HEARTBEAT_INTERVAL_SECONDS; populate_by_name=True also allows
    # direct construction via the field name (used by tests).
    heartbeat_interval_seconds: int = Field(
        default=10,
        ge=1,
        validation_alias="WORKER_HEARTBEAT_INTERVAL_SECONDS",
    )

    # Same escape hatch as the api (env SQLITE_JOURNAL_MODE); both containers must agree.
    sqlite_journal_mode: Literal["WAL", "DELETE"] = Field(
        default="WAL", validation_alias="SQLITE_JOURNAL_MODE"
    )

    # env WORKER_POLL_INTERVAL_SECONDS: how often an idle worker looks for a queued run.
    poll_interval_seconds: int = Field(
        default=2,
        ge=1,
        validation_alias="WORKER_POLL_INTERVAL_SECONDS",
    )

    @field_validator("sqlite_journal_mode", mode="before")
    @classmethod
    def _normalize_journal_mode(cls, value: object) -> object:
        if isinstance(value, str):
            return value.upper()
        return value

    @property
    def heartbeat_path(self) -> Path:
        return layout.heartbeat_file(self.data_dir)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def sync_database_url(self) -> str:
        return f"sqlite:///{self.db_path.resolve().as_posix()}"


def _to_iso_z(value: datetime) -> str:
    """Format a datetime as a UTC ISO-8601 string ending in "Z"."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    else:
        value = value.astimezone(UTC)
    return value.isoformat().replace("+00:00", "Z")


def build_heartbeat(
    pid: int,
    started_at: datetime,
    now: datetime,
    device: ComputeDevice,
    versions: dict[str, str],
    active_run_id: int | None = None,
) -> dict[str, object]:
    """Build the heartbeat payload with exactly the documented key set."""
    return {
        "pid": pid,
        "started_at": _to_iso_z(started_at),
        "last_heartbeat": _to_iso_z(now),
        "torch_version": versions["torch"],
        "ultralytics_version": versions["ultralytics"],
        "cuda_available": device.cuda_available,
        "device": device.device,
        "device_name": device.device_name,
        "active_run_id": active_run_id,
    }


def write_heartbeat(path: Path, payload: dict[str, object]) -> None:
    """Write the heartbeat JSON atomically (T-06-01).

    Writes to a sibling temp file, then `os.replace`s it into place, so
    readers never observe a half-written file and no temp file is left
    behind afterward.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    tmp_path.write_text(json.dumps(payload), encoding="utf-8")
    os.replace(tmp_path, path)


def run(
    settings: WorkerSettings,
    stop_event: threading.Event,
    device_probe: Callable[[], ComputeDevice] = detect_compute_device,
    versions: dict[str, str] | None = None,
    active_run: Callable[[], int | None] = lambda: None,
) -> None:
    """Write a heartbeat immediately, then every `heartbeat_interval_seconds` until stopped.

    `active_run` is read on every beat: the id of the run being trained, or None when idle.
    """
    pid = os.getpid()
    started_at = datetime.now(UTC)
    device = device_probe()
    resolved_versions = (
        versions if versions is not None else {"torch": "unknown", "ultralytics": "unknown"}
    )

    while True:
        now = datetime.now(UTC)
        payload = build_heartbeat(
            pid, started_at, now, device, resolved_versions, active_run_id=active_run()
        )
        write_heartbeat(settings.heartbeat_path, payload)
        if stop_event.wait(settings.heartbeat_interval_seconds):
            return


def _install_signal_handlers(stop_event: threading.Event) -> None:
    def _handle(signum: int, frame: FrameType | None) -> None:
        logger.info("received signal %s, shutting down", signum)
        stop_event.set()

    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)


def main(argv: list[str] | None = None) -> int:
    """Worker entrypoint.

    `--healthcheck` reports heartbeat freshness without importing torch, so
    the compose healthcheck stays cheap. Otherwise, torch/ultralytics are
    imported up front so a broken heavy image fails loudly at start (D-17).
    """
    args = sys.argv[1:] if argv is None else argv
    settings = WorkerSettings()

    if "--healthcheck" in args:
        return 0 if is_heartbeat_fresh(settings.heartbeat_path, 60) else 1

    import torch
    import ultralytics

    device = detect_compute_device()
    versions = {"torch": torch.__version__, "ultralytics": ultralytics.__version__}

    logging.basicConfig(level=logging.INFO)
    logger.info(
        "worker starting: torch=%s ultralytics=%s device=%s cuda_available=%s",
        versions["torch"],
        versions["ultralytics"],
        device.device,
        device.cuda_available,
    )

    from yolo_trainer_worker.queue import create_worker_engine
    from yolo_trainer_worker.supervisor import Supervisor

    stop_event = threading.Event()
    _install_signal_handlers(stop_event)

    engine = create_worker_engine(settings)
    supervisor = Supervisor(engine, settings, device)

    # The heartbeat keeps ticking in the background while the main thread trains; it
    # reports the run being trained so the api can tell a live worker from a dead one.
    heartbeat = threading.Thread(
        target=run,
        args=(settings, stop_event),
        kwargs={
            "device_probe": lambda: device,
            "versions": versions,
            "active_run": lambda: supervisor.active_run_id,
        },
        name="heartbeat",
        daemon=True,
    )
    heartbeat.start()

    try:
        supervisor.serve(stop_event)
    finally:
        stop_event.set()
        heartbeat.join(timeout=5)
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
