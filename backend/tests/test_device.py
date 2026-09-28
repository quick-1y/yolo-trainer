"""Unit tests for yolo_trainer_common.device (parse_device, detect_compute_device)."""

from __future__ import annotations

import subprocess
import sys
import types

import pytest

from yolo_trainer_common.device import ComputeDevice, detect_compute_device, parse_device


class TestParseDevice:
    def test_cpu_lowercase(self):
        assert parse_device("cpu") == "cpu"

    def test_cpu_uppercase_with_whitespace(self):
        assert parse_device(" CPU ") == "cpu"

    def test_single_gpu_index(self):
        assert parse_device("0") == 0

    def test_single_gpu_index_with_whitespace(self):
        assert parse_device(" 1 ") == 1

    def test_multi_gpu_list(self):
        assert parse_device("0,1") == [0, 1]

    def test_invalid_raises_value_error(self):
        with pytest.raises(ValueError):
            parse_device("abc")


def _make_fake_torch(*, cuda_available: bool, device_name: str | None = None):
    """Build a minimal fake `torch` module for injection via sys.modules."""

    def get_device_name(_index):
        if not cuda_available:
            raise AssertionError("get_device_name must not be called when CUDA is unavailable")
        return device_name

    fake_cuda = types.SimpleNamespace(
        is_available=lambda: cuda_available,
        get_device_name=get_device_name,
    )
    return types.SimpleNamespace(cuda=fake_cuda)


class TestDetectComputeDevice:
    def test_no_cuda(self, monkeypatch):
        fake_torch = _make_fake_torch(cuda_available=False)
        monkeypatch.setitem(sys.modules, "torch", fake_torch)

        result = detect_compute_device()

        assert result == ComputeDevice(cuda_available=False, device="cpu", device_name=None)

    def test_cuda_available(self, monkeypatch):
        fake_torch = _make_fake_torch(cuda_available=True, device_name="Fake GPU")
        monkeypatch.setitem(sys.modules, "torch", fake_torch)

        result = detect_compute_device()

        assert result == ComputeDevice(
            cuda_available=True, device="cuda:0", device_name="Fake GPU"
        )


def test_importing_device_module_does_not_import_torch():
    """The api image has no torch installed; the module must stay importable without it."""
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import yolo_trainer_common.device; import sys; "
            "assert 'torch' not in sys.modules, 'torch was eagerly imported'",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
