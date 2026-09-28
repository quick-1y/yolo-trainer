"""Worker heartbeat loop entrypoint (D-17).

The Phase 1 worker proves the heavy CPU ML image (torch + ultralytics) builds
and stays alive: it writes a heartbeat file under `DATA_DIR/worker/` at a
fixed interval, carrying device and version info. It runs no training jobs
yet - how jobs cross from the api container to this worker is a Phase 4
decision (STATE.md blocker).

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

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from yolo_trainer_common.device import ComputeDevice, detect_compute_device

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

    @property
    def heartbeat_path(self) -> Path:
        return self.data_dir / "worker" / "heartbeat.json"


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


def is_heartbeat_fresh(path: Path, max_age_seconds: int = 60, now: datetime | None = None) -> bool:
    """Return True if `path` holds a valid heartbeat newer than `max_age_seconds`.

    False for a missing file, invalid JSON, or a missing/unparseable
    `last_heartbeat` field.
    """
    if now is None:
        now = datetime.now(UTC)

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        last_heartbeat = datetime.fromisoformat(
            str(payload["last_heartbeat"]).replace("Z", "+00:00")
        )
    except (OSError, json.JSONDecodeError, KeyError, ValueError):
        return False

    age_seconds = (now - last_heartbeat).total_seconds()
    return age_seconds < max_age_seconds


def run(
    settings: WorkerSettings,
    stop_event: threading.Event,
    device_probe: Callable[[], ComputeDevice] = detect_compute_device,
    versions: dict[str, str] | None = None,
) -> None:
    """Write a heartbeat immediately, then every `heartbeat_interval_seconds` until stopped."""
    pid = os.getpid()
    started_at = datetime.now(UTC)
    device = device_probe()
    resolved_versions = (
        versions if versions is not None else {"torch": "unknown", "ultralytics": "unknown"}
    )

    while True:
        now = datetime.now(UTC)
        payload = build_heartbeat(pid, started_at, now, device, resolved_versions)
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

    stop_event = threading.Event()
    _install_signal_handlers(stop_event)

    run(settings, stop_event, versions=versions)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
