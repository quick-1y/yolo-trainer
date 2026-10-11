"""A stand-in for `yolo_trainer_worker.train_job` used by the supervisor tests.

It imports no training library and does no training: it writes the same files the
real job writes (`progress.jsonl`, `out/train/weights/{best,last}.pt`, `result.json` /
`error.json`) so the supervisor, registration and download can be tested fast.

Modes: `success`, `fail` (exit 1 with error.json after 80 noisy lines), `crash` (exit 3, no
error.json), `oom` (exit 1, error.json with the out-of-memory category), `badcategory` (exit 1,
error.json with a category outside the allow-list), `exit137` (exit 137, no error.json), `sleep`
(one real epoch, then sleeps for a minute so a test can stop the worker). Every real epoch writes
`weights/last.pt` and `weights/best.pt` and a `model_save` event, like Ultralytics does.

`--resume` models a resumed segment of a 2-epoch run that had saved epoch 1: it refuses to start
without `weights/last.pt` (error.json, category `not_resumable`, exit 1, like the real job), writes
a `train_start` with `resumed` true and `start_epoch` 1, runs epoch 2 (the last one), the
final-validation event, the weights and `result.json`, and exits 0. Mode `resume_hold` stops right
after the `train_start` and sleeps, so a test can look at the run while a resumed segment is up.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from yolo_trainer_common.failures import classify_exception

BEST_BYTES = b"fake-best-weights"
LAST_BYTES = b"fake-last-weights-differ"
BATCHES_PER_EPOCH = 4


def _emit(run_dir: Path, event: str, **fields: object) -> None:
    line = json.dumps({"event": event, "time": time.time(), "v": 2, **fields})
    with (run_dir / "progress.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")
        handle.flush()


def _real_epoch(run_dir: Path, epoch: int, epochs: int, map50: float) -> None:
    for batch in range(1, BATCHES_PER_EPOCH + 1):
        _emit(
            run_dir,
            "batch_progress",
            epoch=epoch,
            epochs=epochs,
            batch=batch,
            nb=BATCHES_PER_EPOCH,
        )
    _emit(run_dir, "train_epoch_end", epoch=epoch, epochs=epochs, tloss={"box_loss": 1.0})
    # Ultralytics saves the checkpoints and emits on_model_save BEFORE on_fit_epoch_end, so a
    # cancelled run has an interim best.pt and last.pt from every epoch it finished.
    weights = run_dir / "out" / "train" / "weights"
    weights.mkdir(parents=True, exist_ok=True)
    (weights / "last.pt").write_bytes(LAST_BYTES)
    (weights / "best.pt").write_bytes(BEST_BYTES)
    _emit(
        run_dir,
        "model_save",
        epoch=epoch,
        last=str(weights / "last.pt"),
        best=str(weights / "best.pt"),
    )
    _emit(
        run_dir,
        "fit_epoch_end",
        epoch=epoch,
        epochs=epochs,
        final_validation=False,
        last_epoch=epoch == epochs,
        fitness=map50 - 0.2,
        metrics={"metrics/mAP50(B)": map50, "val/box_loss": 1.5},
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--mode", required=True)
    parser.add_argument("--resume", action="store_true")
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

    if args.mode == "oom":
        # Exactly what train_job.main() writes for an out-of-memory failure.
        message = "CUDA out of memory. Tried to allocate 2.00 GiB."
        type_name = "OutOfMemoryError"
        print("epoch 1/3", flush=True)
        print(f"torch.OutOfMemoryError: {message}", flush=True)
        (run_dir / "error.json").write_text(
            json.dumps(
                {
                    "type": type_name,
                    "message": message,
                    "category": classify_exception(type_name, message),
                }
            ),
            encoding="utf-8",
        )
        return 1

    if args.mode == "badcategory":
        # A category outside the allow-list must never reach the database.
        (run_dir / "error.json").write_text(
            json.dumps(
                {
                    "type": "RuntimeError",
                    "message": "Fake failure with a made-up category.",
                    "category": "<img src=x onerror=alert(1)>",
                }
            ),
            encoding="utf-8",
        )
        return 1

    if args.mode == "exit137":
        # What the OS kill of a training process leaves behind: no error.json at all.
        print("epoch 1/3", flush=True)
        return 137

    epochs = 2
    if args.resume and not (run_dir / "out" / "train" / "weights" / "last.pt").is_file():
        message = "The saved checkpoint is missing."
        (run_dir / "error.json").write_text(
            json.dumps(
                {"type": "CheckpointError", "message": message, "category": "not_resumable"}
            ),
            encoding="utf-8",
        )
        return 1
    _emit(
        run_dir,
        "train_start",
        epochs=epochs,
        start_epoch=1 if args.resume else 0,
        resumed=args.resume,
        nb=BATCHES_PER_EPOCH,
    )
    if args.resume:
        if args.mode == "resume_hold":
            time.sleep(60)
            return 0
    else:
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
