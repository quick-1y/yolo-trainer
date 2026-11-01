"""On-disk contract shared by the api and the worker (D-19).

Both containers mount the same `DATA_DIR`, so every path of a training run, a
registered model, the weights cache and the worker's own files is built here,
from a `data_dir` and integers or allow-listed names only - a user-supplied
string never reaches the filesystem. The module is pure and torch-free, so the
api image can import it.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

# Official Ultralytics weights the service may download (D-07): YOLO26 and
# YOLO11, sizes n/s/m/l/x, optionally the `-seg` variant.
OFFICIAL_WEIGHTS_PATTERN = r"^yolo(26|11)[nsmlx](-seg)?$"
_OFFICIAL_WEIGHTS = re.compile(OFFICIAL_WEIGHTS_PATTERN)

# File names inside a run folder.
JOB_FILE = "job.json"
PROGRESS_FILE = "progress.jsonl"
LOG_FILE = "train.log"
RESULT_FILE = "result.json"
ERROR_FILE = "error.json"
RESOLVED_FILE = "resolved.json"
MANIFEST_FILE = "manifest.json"
# The base weights of a run (`{"name", "sha256"}`), written by the first segment so a resumed
# segment never needs the base model file again.
BASE_FILE = "base.json"
DATA_YAML = "data.yaml"


def runs_root(data_dir: Path) -> Path:
    return data_dir / "runs"


def run_dir(data_dir: Path, run_id: int) -> Path:
    return runs_root(data_dir) / str(int(run_id))


def dataset_dir(data_dir: Path, run_id: int) -> Path:
    return run_dir(data_dir, run_id) / "dataset"


def models_root(data_dir: Path) -> Path:
    return data_dir / "models"


def model_file(data_dir: Path, model_id: int) -> Path:
    return models_root(data_dir) / f"{int(model_id)}.pt"


def weights_root(data_dir: Path) -> Path:
    return data_dir / "weights"


def weights_file(data_dir: Path, name: str) -> Path:
    """The cached official weights file for an allow-listed `name` (no extension)."""
    if not _OFFICIAL_WEIGHTS.fullmatch(name):
        raise ValueError(f"Not an official weights name: {name!r}")
    return weights_root(data_dir) / f"{name}.pt"


def worker_root(data_dir: Path) -> Path:
    return data_dir / "worker"


def heartbeat_file(data_dir: Path) -> Path:
    return worker_root(data_dir) / "heartbeat.json"


def ultralytics_config_dir(data_dir: Path) -> Path:
    return worker_root(data_dir) / "ultralytics"


def best_weights(run_directory: Path) -> Path:
    return run_directory / "out" / "train" / "weights" / "best.pt"


def last_weights(run_directory: Path) -> Path:
    return run_directory / "out" / "train" / "weights" / "last.pt"


def write_text_atomic(path: Path, text: str) -> None:
    """Write `text` through a sibling temp file and `os.replace` it into place.

    Readers never observe a half-written file, and the temp file is gone afterwards.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    try:
        tmp_path.write_text(text, encoding="utf-8")
        os.replace(tmp_path, path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def write_json_atomic(path: Path, payload: object) -> None:
    """Atomically write `payload` as UTF-8 JSON; NaN and infinity are refused."""
    write_text_atomic(path, json.dumps(payload, ensure_ascii=False, allow_nan=False))
