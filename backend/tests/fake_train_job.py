"""A stand-in for `yolo_trainer_worker.train_job` used by the supervisor tests.

It imports no training library and does no training: it writes the same files the
real job writes (`progress.jsonl`, `out/train/weights/{best,last}.pt`, `result.json` /
`error.json`) so the supervisor, registration and download can be tested fast.

Modes: `success`, `fail` (exit 1 with error.json after 80 noisy lines), `crash` (exit 3, no
error.json), `sleep` (one real epoch, then sleeps for a minute so a test can stop the worker).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

BEST_BYTES = b"fake-best-weights"
LAST_BYTES = b"fake-last-weights-differ"


def _emit(run_dir: Path, event: str, **fields: object) -> None:
    line = json.dumps({"event": event, "time": time.time(), **fields})
    with (run_dir / "progress.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")
        handle.flush()


def _real_epoch(run_dir: Path, epoch: int, epochs: int, map50: float) -> None:
    _emit(run_dir, "train_epoch_end", epoch=epoch, epochs=epochs, tloss={"box_loss": 1.0})
    _emit(
        run_dir,
        "fit_epoch_end",
        epoch=epoch,
        epochs=epochs,
        final_validation=False,
        metrics={"metrics/mAP50(B)": map50, "val/box_loss": 1.5},
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--mode", required=True)
    args = parser.parse_args()
    run_dir: Path = args.run_dir

    if args.mode == "crash":
        print("about to crash", flush=True)
        return 3

    if args.mode == "fail":
        for number in range(80):  # more noise than the stored log tail may keep
            print(f"\x1b[33mnoise {number}\x1b[0m\r", flush=True)
        for number in range(1, 4):
            print(f"\x1b[31mline {number}\x1b[0m", flush=True)
        print("progress 50%\r", end="", flush=True)
        (run_dir / "error.json").write_text(
            json.dumps({"type": "RuntimeError", "message": "Fake failure."}), encoding="utf-8"
        )
        return 1

    epochs = 2
    _real_epoch(run_dir, 1, epochs, 0.5)
    if args.mode == "sleep":
        time.sleep(60)
        return 0

    _real_epoch(run_dir, 2, epochs, 0.6)
    _emit(
        run_dir,
        "fit_epoch_end",
        epoch=epochs,
        epochs=epochs,
        final_validation=True,
        metrics={
            "metrics/precision(B)": 0.8,
            "metrics/recall(B)": 0.7,
            "metrics/mAP50(B)": 0.7,
            "metrics/mAP50-95(B)": 0.4,
        },
    )
    weights = run_dir / "out" / "train" / "weights"
    weights.mkdir(parents=True, exist_ok=True)
    (weights / "best.pt").write_bytes(BEST_BYTES)
    (weights / "last.pt").write_bytes(LAST_BYTES)
    manifest = json.loads((run_dir / "dataset" / "manifest.json").read_text(encoding="utf-8"))
    names = [item["name"] for item in sorted(manifest["classes"], key=lambda item: item["index"])]
    (run_dir / "result.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "task": manifest["task_type"],
                "names": names,
            }
        ),
        encoding="utf-8",
    )
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
