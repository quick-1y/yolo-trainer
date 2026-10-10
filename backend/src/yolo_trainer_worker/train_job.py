"""Training subprocess entry: `python -m yolo_trainer_worker.train_job --run-dir ...`.

Runs inside the worker container, started by the supervisor. It never opens the
database: it reads `job.json`, trains with Ultralytics, appends progress events
to `progress.jsonl` through Ultralytics callbacks, and ends with `result.json`
(exit 0) or `error.json` (exit 1). Stdout and stderr land in `train.log`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import traceback
from pathlib import Path

from yolo_trainer_common import layout
from yolo_trainer_common.progress import (
    EVENT_FIT_EPOCH_END,
    EVENT_MODEL_SAVE,
    EVENT_TRAIN_END,
    EVENT_TRAIN_EPOCH_END,
    jsonable,
)

_HASH_CHUNK = 1024 * 1024


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="yolo_trainer_worker.train_job")
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument(
        "--device",
        required=True,
        # "cpu" or a GPU index; never a free-form string (T4-02).
        type=lambda value: value if value == "cpu" or value.isdecimal() else _bad_device(value),
    )
    parser.add_argument("--batch", required=True, type=int)
    parser.add_argument("--workers", required=True, type=int)
    return parser.parse_args(argv)


def _bad_device(value: str) -> str:
    raise argparse.ArgumentTypeError(f"invalid device: {value!r}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(_HASH_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve_weights(data_dir: Path, base: dict) -> Path:
    """The weights file to start from: a model trained here, or a cached official one.

    A model base resolves to `DATA_DIR/models/<id>.pt` from its integer id alone; no path
    from `job.json` is ever used (T4-01, T4-08-01). An official base is downloaded on first
    use (Pitfall 6): the path is always absolute and below `DATA_DIR/weights/`, because a
    relative name would download into the working directory, and the name is re-validated
    against the allow-list pattern here.
    """
    if base.get("kind") == "model":
        model_id = base.get("model_id")
        if isinstance(model_id, bool) or not isinstance(model_id, int):
            raise ValueError(f"Not a model id: {model_id!r}")
        model_path = layout.model_file(data_dir, model_id)
        if not model_path.is_file():
            raise RuntimeError("The base model file is missing.")
        return model_path
    if base.get("kind") != "official":
        raise RuntimeError("Unknown base model kind.")
    name = str(base.get("name", ""))
    path = layout.weights_file(data_dir, name)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        from ultralytics.utils.downloads import attempt_download_asset

        attempt_download_asset(str(path))
    if not path.exists():
        raise RuntimeError(
            f"Could not download {name}.pt. Check the internet access of the worker container, "
            f"or place the file in {layout.weights_root(data_dir)}/."
        )
    return path


def configure_ultralytics(data_dir: Path) -> None:
    """Turn analytics off and point the weights cache at `DATA_DIR/weights` (Pitfall 5).

    Runs before any model exists. `YOLO_CONFIG_DIR`, set by the supervisor, keeps the
    settings file away from any user settings. Do not set `YOLO_OFFLINE`: it would also
    disable the weights download.
    """
    from ultralytics import settings as yolo_settings

    yolo_settings.update({"sync": False, "weights_dir": str(layout.weights_root(data_dir))})


class ProgressWriter:
    """Appends one JSON line per event; values pass through `jsonable` (no NaN, no tensors)."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def emit(self, event: str, **fields: object) -> None:
        record = jsonable({"event": event, "time": time.time(), **fields})
        line = json.dumps(record, ensure_ascii=False, allow_nan=False)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
            handle.flush()


def _train(args: argparse.Namespace) -> None:
    run_directory: Path = args.run_dir
    data_dir: Path = args.data_dir
    job = json.loads((run_directory / layout.JOB_FILE).read_text(encoding="utf-8"))
    settings = job["settings"]

    configure_ultralytics(data_dir)

    import torch
    import ultralytics
    import ultralytics.data.utils as ultralytics_data_utils
    from ultralytics import YOLO

    # The dataset check downloads Arial.ttf (a font for plots) from the internet; plots
    # are off, and a run's only outbound access is the official weights download.
    ultralytics_data_utils.check_font = lambda font="Arial.ttf": font

    weights = _resolve_weights(data_dir, job["base"])
    model = YOLO(str(weights))

    writer = ProgressWriter(run_directory / layout.PROGRESS_FILE)
    state: dict = {"pending": False, "last_epoch": 0, "final_metrics": None}

    def on_train_epoch_end(trainer) -> None:  # noqa: ANN001
        state["pending"] = True
        state["last_epoch"] = trainer.epoch + 1
        writer.emit(
            EVENT_TRAIN_EPOCH_END,
            epoch=trainer.epoch + 1,
            epochs=trainer.epochs,
            tloss=trainer.tloss,
        )

    def on_fit_epoch_end(trainer) -> None:  # noqa: ANN001
        # Ultralytics fires this once more after training, with the validation of best.pt;
        # it follows no on_train_epoch_end, so the pending flag tells it apart (D-12).
        final = not state["pending"]
        state["pending"] = False
        metrics = dict(trainer.metrics)
        if final:
            state["final_metrics"] = metrics
        writer.emit(
            EVENT_FIT_EPOCH_END,
            epoch=state["last_epoch"] if final else trainer.epoch + 1,
            epochs=trainer.epochs,
            final_validation=final,
            metrics=metrics,
        )

    def on_model_save(trainer) -> None:  # noqa: ANN001
        writer.emit(
            EVENT_MODEL_SAVE,
            epoch=trainer.epoch + 1,
            last=str(trainer.last),
            best=str(trainer.best),
        )

    def on_train_end(trainer) -> None:  # noqa: ANN001
        writer.emit(EVENT_TRAIN_END, best=str(trainer.best), last=str(trainer.last))

    model.add_callback("on_train_epoch_end", on_train_epoch_end)
    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
    model.add_callback("on_model_save", on_model_save)
    model.add_callback("on_train_end", on_train_end)

    model.train(
        data=str(layout.dataset_dir(data_dir, job["run_id"]) / layout.DATA_YAML),
        epochs=int(settings["epochs"]),
        imgsz=int(settings["imgsz"]),
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        project=str(run_directory / "out"),
        name="train",
        exist_ok=True,
        plots=False,
        verbose=False,
    )

    names = model.names
    layout.write_json_atomic(
        run_directory / layout.RESULT_FILE,
        {
            "schema_version": 1,
            "task": model.task,
            "names": [names[index] for index in sorted(names)],
            "best": "out/train/weights/best.pt",
            "last": "out/train/weights/last.pt",
            "final_metrics": jsonable(state["final_metrics"] or {}),
            "epochs_completed": state["last_epoch"],
            "ultralytics_version": ultralytics.__version__,
            "torch_version": torch.__version__,
            "base_weights": {"name": job["base"]["name"], "sha256": _sha256(weights)},
        },
    )


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    try:
        _train(args)
    except Exception as exc:
        layout.write_json_atomic(
            args.run_dir / layout.ERROR_FILE, {"type": type(exc).__name__, "message": str(exc)}
        )
        traceback.print_exc()  # lands in train.log
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
