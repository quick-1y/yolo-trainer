"""Unit tests for yolo_trainer_worker.main (heartbeat loop, atomic writes, --healthcheck).

No real torch/ultralytics import and no real sleeping: device is a fake probe,
timestamps are fixed values, and `run()` is only ever exercised with a
pre-set `stop_event` so the loop body executes exactly once.
"""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_worker.main import (
    WorkerSettings,
    build_heartbeat,
    is_heartbeat_fresh,
    main,
    run,
    write_heartbeat,
)

FIXED_DEVICE = ComputeDevice(cuda_available=False, device="cpu", device_name=None)
FIXED_VERSIONS = {"torch": "2.14.0+cpu", "ultralytics": "8.4.159"}


class TestBuildHeartbeat:
    def test_returns_exact_key_set(self):
        started = datetime(2026, 1, 1, tzinfo=UTC)
        now = datetime(2026, 1, 1, 0, 0, 5, tzinfo=UTC)

        payload = build_heartbeat(42, started, now, FIXED_DEVICE, FIXED_VERSIONS)

        assert set(payload.keys()) == {
            "pid",
            "started_at",
            "last_heartbeat",
            "torch_version",
            "ultralytics_version",
            "cuda_available",
            "device",
            "device_name",
        }

    def test_values_and_iso_z_timestamps(self):
        started = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
        now = datetime(2026, 1, 1, 12, 0, 5, tzinfo=UTC)

        payload = build_heartbeat(42, started, now, FIXED_DEVICE, FIXED_VERSIONS)

        assert payload["pid"] == 42
        assert payload["started_at"].endswith("Z")
        assert payload["last_heartbeat"].endswith("Z")
        assert payload["torch_version"] == "2.14.0+cpu"
        assert payload["ultralytics_version"] == "8.4.159"
        assert payload["cuda_available"] is False
        assert payload["device"] == "cpu"
        assert payload["device_name"] is None


class TestWriteHeartbeat:
    def test_creates_parent_dirs_and_writes_valid_json(self, tmp_path: Path):
        path = tmp_path / "worker" / "heartbeat.json"

        write_heartbeat(path, {"pid": 1})

        assert path.exists()
        assert json.loads(path.read_text(encoding="utf-8")) == {"pid": 1}

    def test_leaves_no_temp_file(self, tmp_path: Path):
        path = tmp_path / "worker" / "heartbeat.json"

        write_heartbeat(path, {"pid": 1})

        assert list(path.parent.iterdir()) == [path]

    def test_replaces_existing_file_atomically(self, tmp_path: Path):
        path = tmp_path / "worker" / "heartbeat.json"
        write_heartbeat(path, {"pid": 1})

        write_heartbeat(path, {"pid": 2})

        assert json.loads(path.read_text(encoding="utf-8")) == {"pid": 2}
        assert list(path.parent.iterdir()) == [path]


class TestIsHeartbeatFresh:
    def test_true_for_recent_heartbeat(self, tmp_path: Path):
        path = tmp_path / "heartbeat.json"
        now = datetime(2026, 1, 1, 12, 0, 5, tzinfo=UTC)
        started = now - timedelta(seconds=5)
        write_heartbeat(path, build_heartbeat(1, started, started, FIXED_DEVICE, FIXED_VERSIONS))

        assert is_heartbeat_fresh(path, max_age_seconds=60, now=now) is True

    def test_false_for_stale_heartbeat(self, tmp_path: Path):
        path = tmp_path / "heartbeat.json"
        stale_at = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
        now = stale_at + timedelta(seconds=61)
        write_heartbeat(path, build_heartbeat(1, stale_at, stale_at, FIXED_DEVICE, FIXED_VERSIONS))

        assert is_heartbeat_fresh(path, max_age_seconds=60, now=now) is False

    def test_false_when_file_missing(self, tmp_path: Path):
        path = tmp_path / "missing.json"

        assert is_heartbeat_fresh(path) is False

    def test_false_when_file_not_valid_json(self, tmp_path: Path):
        path = tmp_path / "heartbeat.json"
        path.write_text("not json", encoding="utf-8")

        assert is_heartbeat_fresh(path) is False


class TestRun:
    def test_stop_event_already_set_writes_once_and_returns(self, tmp_path: Path):
        settings = WorkerSettings(data_dir=tmp_path, heartbeat_interval_seconds=1)
        stop_event = threading.Event()
        stop_event.set()
        calls = {"count": 0}

        def fake_probe() -> ComputeDevice:
            calls["count"] += 1
            return FIXED_DEVICE

        run(settings, stop_event, device_probe=fake_probe, versions=FIXED_VERSIONS)

        assert calls["count"] == 1
        assert settings.heartbeat_path.exists()
        payload = json.loads(settings.heartbeat_path.read_text(encoding="utf-8"))
        assert payload["cuda_available"] is False
        assert payload["torch_version"] == "2.14.0+cpu"


class TestWorkerSettings:
    def test_env_var_overrides_heartbeat_interval(self, monkeypatch, tmp_path: Path):
        monkeypatch.setenv("WORKER_HEARTBEAT_INTERVAL_SECONDS", "5")
        monkeypatch.setenv("DATA_DIR", str(tmp_path))

        settings = WorkerSettings()

        assert settings.heartbeat_interval_seconds == 5
        assert settings.heartbeat_path == tmp_path / "worker" / "heartbeat.json"

    def test_rejects_interval_below_one(self):
        with pytest.raises(ValidationError):
            WorkerSettings(heartbeat_interval_seconds=0)


class TestMainHealthcheck:
    def test_exits_0_when_fresh(self, monkeypatch, tmp_path: Path):
        monkeypatch.setenv("DATA_DIR", str(tmp_path))
        heartbeat_path = tmp_path / "worker" / "heartbeat.json"
        now = datetime.now(UTC)
        write_heartbeat(heartbeat_path, build_heartbeat(1, now, now, FIXED_DEVICE, FIXED_VERSIONS))

        assert main(["--healthcheck"]) == 0

    def test_exits_1_when_missing(self, monkeypatch, tmp_path: Path):
        monkeypatch.setenv("DATA_DIR", str(tmp_path))

        assert main(["--healthcheck"]) == 1

    def test_exits_1_when_stale(self, monkeypatch, tmp_path: Path):
        monkeypatch.setenv("DATA_DIR", str(tmp_path))
        heartbeat_path = tmp_path / "worker" / "heartbeat.json"
        stale = datetime.now(UTC) - timedelta(seconds=120)
        write_heartbeat(
            heartbeat_path, build_heartbeat(1, stale, stale, FIXED_DEVICE, FIXED_VERSIONS)
        )

        assert main(["--healthcheck"]) == 1
