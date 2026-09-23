"""
Phase 0 spike: validate the Ultralytics callback-based progress-capture design
from docs/roadmap.md section 9.2, and empirically record trainer.metrics key
shapes for the pinned Ultralytics version.

Not part of the shipped application. Throwaway spike code.

Trains a real (short) run against the repo's example_ready_dataset (segment
task, since that dataset is polygon-labeled per the roadmap's audit) and
appends one structured JSON line per on_fit_epoch_end event to
spikes/output/progress.jsonl -- mirroring the exact file-based progress
channel design the real train_worker.py (Phase 7) will use.
"""

import json
import sys
import time
from pathlib import Path

from ultralytics import YOLO

SPIKE_DIR = Path(__file__).parent
OUTPUT_DIR = SPIKE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)
PROGRESS_FILE = OUTPUT_DIR / "progress.jsonl"
METRICS_KEYS_FILE = OUTPUT_DIR / "metrics_keys_captured.json"

DATASET_YAML = SPIKE_DIR.parent / "example_ready_dataset" / "data.yaml"


def _json_safe(value):
    """Coerce tensors/numpy scalars into plain JSON-serializable values."""
    try:
        import torch

        if isinstance(value, torch.Tensor):
            return value.detach().cpu().tolist()
    except ImportError:
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except (ValueError, RuntimeError):
            pass
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return str(value)


def write_progress_event(event_type: str, payload: dict):
    record = {"ts": time.time(), "event": event_type, **payload}
    with PROGRESS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, default=_json_safe) + "\n")


def on_train_epoch_end(trainer):
    write_progress_event(
        "train_epoch_end",
        {
            "epoch": trainer.epoch,
            "total_epochs": trainer.epochs,
            "tloss": _json_safe(trainer.tloss),
            "loss_names": trainer.loss_names,
        },
    )


def on_fit_epoch_end(trainer):
    metrics_dict = dict(trainer.metrics) if trainer.metrics else {}
    # Capture the raw key set once, for the roadmap's "open item" (section 9.2 / 16):
    # exact trainer.metrics key names were not enumerated in Ultralytics docs.
    if not METRICS_KEYS_FILE.exists():
        METRICS_KEYS_FILE.write_text(
            json.dumps(
                {
                    "captured_at_epoch": trainer.epoch,
                    "keys": sorted(metrics_dict.keys()),
                    "sample_values": {k: _json_safe(v) for k, v in metrics_dict.items()},
                },
                indent=2,
                default=_json_safe,
            ),
            encoding="utf-8",
        )
    write_progress_event(
        "fit_epoch_end",
        {
            "epoch": trainer.epoch,
            "metrics": {k: _json_safe(v) for k, v in metrics_dict.items()},
            "best_fitness": _json_safe(trainer.best_fitness),
        },
    )


def on_model_save(trainer):
    write_progress_event(
        "model_save",
        {"epoch": trainer.epoch, "last": str(trainer.last), "best": str(trainer.best)},
    )


def on_train_end(trainer):
    write_progress_event(
        "train_end",
        {"best": str(trainer.best), "last": str(trainer.last)},
    )


def main():
    if not DATASET_YAML.exists():
        print(f"ERROR: dataset yaml not found at {DATASET_YAML}", file=sys.stderr)
        sys.exit(1)

    # Fresh progress file per run.
    if PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
    if METRICS_KEYS_FILE.exists():
        METRICS_KEYS_FILE.unlink()

    print(f"CUDA available: {__import__('torch').cuda.is_available()} (expected False on this machine)")
    # NOTE (Phase 0 finding, corrects the roadmap's original §1.7/§7.2 read):
    # example_ready_dataset is overwhelmingly DETECTION-format (278/280 train
    # objects are plain 5-value box rows); only a handful of stray rows (2
    # train, 2 valid, 4 test) are real polygons. A `segment` task run fails
    # Ultralytics' own homogeneity check ("Segment dataset requires equal
    # numbers of boxes and segments"). Using `detect` here, which tolerates
    # the stray polygon rows by auto-collapsing them to their bounding box.
    print("Loading yolo11n.pt (detect task -- dataset is predominantly box-format, see note above)...")

    model = YOLO("yolo11n.pt")
    model.add_callback("on_train_epoch_end", on_train_epoch_end)
    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
    model.add_callback("on_model_save", on_model_save)
    model.add_callback("on_train_end", on_train_end)

    write_progress_event("job_start", {"dataset": str(DATASET_YAML), "task": "segment"})

    start = time.time()
    model.train(
        data=str(DATASET_YAML),
        epochs=2,
        imgsz=320,
        batch=4,
        workers=0,  # avoid multiprocessing worker overhead on Windows CPU-only spike
        device="cpu",
        project=str(OUTPUT_DIR / "runs"),
        name="spike",
        verbose=False,
        plots=False,
        val=True,
    )
    elapsed = time.time() - start

    print(f"\nDone in {elapsed:.1f}s")
    print(f"Progress channel: {PROGRESS_FILE}")
    print(f"Captured metrics keys: {METRICS_KEYS_FILE}")


if __name__ == "__main__":
    main()
