"""Device selection and compute-device detection helpers.

Extracted from the legacy `train_yolo.py` / `finetune_yolo.py` CLI scripts
(D-24: behavior preserved exactly). This module is imported by the FastAPI
`api` image, which does not install torch — `detect_compute_device` therefore
imports torch lazily, inside the function body, so importing this module
never pulls torch into the api image's dependency graph.
"""

from __future__ import annotations

from dataclasses import dataclass


def parse_device(device_str: str) -> str | int | list[int]:
    """Parse a device string into the form Ultralytics expects.

    "cpu" (case-insensitive, surrounding whitespace ignored) -> "cpu"
    A comma-separated list of integers -> list[int] (multi-GPU)
    Otherwise -> int (single GPU index)

    Raises ValueError if the string cannot be parsed as "cpu" or integer(s).
    """
    device_str = device_str.strip()
    if device_str.lower() == "cpu":
        return "cpu"
    if "," in device_str:
        return [int(d) for d in device_str.split(",")]
    return int(device_str)


@dataclass(frozen=True)
class ComputeDevice:
    """Result of compute-device detection."""

    cuda_available: bool
    device: str
    device_name: str | None


def detect_compute_device() -> ComputeDevice:
    """Detect whether CUDA is available and which device to report.

    Imports torch lazily so this module stays importable in torch-free
    environments (e.g. the api Docker image). Only calls
    `torch.cuda.get_device_name` after confirming `torch.cuda.is_available()`
    is True — the unguarded call is the crash `gpu_test.py` has today.
    """
    import torch

    if torch.cuda.is_available():
        device_name = torch.cuda.get_device_name(0)
        return ComputeDevice(cuda_available=True, device="cuda:0", device_name=device_name)
    return ComputeDevice(cuda_available=False, device="cpu", device_name=None)
