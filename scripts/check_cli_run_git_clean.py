"""Prove FOUND-03: a real CLI training run leaves `git status` unchanged.

Resolves the repo root, drives the actual legacy `train_yolo.train()` code
path (the FOUND-02 shared-module path) through a tiny, fast, CPU-only 1-epoch
run against `example_ready_dataset/`, and asserts that `git status --porcelain`
is identical before and after. Never silently passes: a missing dataset exits
with a distinct status code instead of skipping the check.

Exit codes:
    0 - success, `GIT CLEAN OK` printed
    1 - `git status --porcelain` changed across the training run
    3 - `example_ready_dataset/train/images` is missing (cannot run the check)
"""

from __future__ import annotations

import configparser
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = REPO_ROOT / "example_ready_dataset"
RUNS_DIR = REPO_ROOT / "runs"


def git_status_porcelain() -> str:
    """Return the full untracked-inclusive porcelain git status output."""
    result = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def build_train_config() -> configparser.SectionProxy:
    """Build an in-memory [Train] config for a tiny, fast, CPU-only run."""
    conf = configparser.ConfigParser()
    conf["Train"] = {
        "dataset_path": "example_ready_dataset",
        "name_model": "yolov8n.pt",
        "epochs": "1",
        "imgsz": "64",
        "device": "cpu",
        "workers": "0",
        "optimizer": "SGD",
        "pretrained": "True",
        "amp": "False",
        "augment": "False",
        "project": "runs/hygiene-check",
        "name": "run",
        "verbose": "False",
    }
    return conf["Train"]


def main() -> int:
    os.chdir(REPO_ROOT)
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))

    if not (DATASET_DIR / "train" / "images").is_dir():
        print(
            f"ERROR: dataset images not found at {DATASET_DIR / 'train' / 'images'}. "
            "This check requires example_ready_dataset/ to be present.",
            file=sys.stderr,
        )
        return 3

    status_before = git_status_porcelain()

    import train_yolo  # local import: only needed once the dataset check passes

    train_yolo.train(build_train_config())

    status_after = git_status_porcelain()

    # Ultralytics nests the actual output under runs/<task>/<project>/<name>/ (not
    # directly under the given `project` path), so search for it instead of
    # assuming one fixed location.
    if RUNS_DIR.is_dir():
        for hygiene_dir in RUNS_DIR.rglob("hygiene-check"):
            shutil.rmtree(hygiene_dir, ignore_errors=True)

    if status_before != status_after:
        print("git status BEFORE training run:", file=sys.stderr)
        print(status_before or "(clean)", file=sys.stderr)
        print("git status AFTER training run:", file=sys.stderr)
        print(status_after or "(clean)", file=sys.stderr)
        return 1

    print("GIT CLEAN OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
