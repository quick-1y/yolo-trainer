"""Tests for scripts/verify_model_download.py (the downstream-style check of a downloaded `.pt`).

The script is run as a plain subprocess, exactly the way the owner runs it, with a throwaway
Ultralytics config directory so the tests never touch the user's own settings. The real-load
cases are behind the `training` marker and need the git-ignored `yolo26n.pt` in the repository
root:

    uv run pytest -m training backend/tests/test_verify_model_download.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "verify_model_download.py"
BASE_WEIGHTS = REPO_ROOT / "yolo26n.pt"
RUN_TIMEOUT_SECONDS = 300


def run_script(args: list[str], config_dir: Path) -> subprocess.CompletedProcess[str]:
    # Ultralytics needs the directory to exist; otherwise it falls back to ./Ultralytics in the cwd.
    config_dir.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "YOLO_CONFIG_DIR": str(config_dir)}
    return subprocess.run(
        [sys.executable, "scripts/verify_model_download.py", *args],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=RUN_TIMEOUT_SECONDS,
    )


def test_a_missing_path_exits_1_with_a_plain_message(tmp_path: Path) -> None:
    missing = tmp_path / "nope.pt"

    completed = run_script([str(missing)], tmp_path / "config")

    assert completed.returncode == 1
    assert f"Model file not found: {missing}" in completed.stderr


def test_a_text_file_renamed_to_pt_exits_1_with_a_load_message(tmp_path: Path) -> None:
    fake = tmp_path / "fake.pt"
    fake.write_text("this is not a model", encoding="utf-8")

    completed = run_script([str(fake)], tmp_path / "config")

    assert completed.returncode == 1
    assert completed.stderr.startswith("Could not load the model")


@pytest.mark.training
def test_the_base_model_loads_and_predicts_on_a_blank_frame(tmp_path: Path) -> None:
    if not BASE_WEIGHTS.is_file():
        pytest.skip("yolo26n.pt is not in the repository root")

    completed = run_script([str(BASE_WEIGHTS), "--imgsz", "64"], tmp_path / "config")

    assert completed.returncode == 0, completed.stderr
    lines = completed.stdout.splitlines()
    assert "task: detect" in lines
    assert any(line.startswith("names:") for line in lines)
    assert lines[-1] == "OK"


@pytest.mark.training
def test_the_base_model_predicts_on_a_given_image(tmp_path: Path) -> None:
    if not BASE_WEIGHTS.is_file():
        pytest.skip("yolo26n.pt is not in the repository root")
    image_path = tmp_path / "sample.png"
    Image.new("RGB", (64, 64), (120, 80, 40)).save(image_path)

    completed = run_script(
        [str(BASE_WEIGHTS), "--image", str(image_path), "--imgsz", "64"], tmp_path / "config"
    )

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.splitlines()[-1] == "OK"
