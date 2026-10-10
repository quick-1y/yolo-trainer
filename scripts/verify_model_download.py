"""Check a downloaded model the way the downstream project loads its own `.pt`.

The downstream project loads `trained_models/best.pt` with a plain `YOLO(path)` and calls
`predict` on it. This script does exactly that to a file downloaded from the training service,
so a model that passes here will load there (given a compatible Ultralytics version).

    uv run python scripts/verify_model_download.py plates_run-3_best.pt
    uv run python scripts/verify_model_download.py plates_run-3_best.pt --image photo.jpg
    uv run python scripts/verify_model_download.py plates_run-3_best.pt --imgsz 320

It prints the model's task and class names, runs one prediction (on the given image, or on a
blank frame when none is given) and prints OK.

Exit codes: 0 = the model loaded and predicted, 1 = the file is missing or cannot be loaded,
2 = the prediction failed.

A `.pt` file is a pickle and can run code when it is loaded: only check files you produced
yourself or otherwise trust.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_IMGSZ = 640


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("path", type=Path, help="the downloaded .pt file")
    parser.add_argument(
        "--image", type=Path, default=None, help="an image to predict on"
    )
    parser.add_argument(
        "--imgsz", type=int, default=DEFAULT_IMGSZ, help="prediction image size"
    )
    args = parser.parse_args(argv)

    if not args.path.is_file():
        print(f"Model file not found: {args.path}", file=sys.stderr)
        return 1

    # Imported late: a missing file is reported without paying for the Ultralytics import.
    import numpy as np
    from ultralytics import YOLO, settings

    # A check must not send analytics; the setting is switched off before the model is touched.
    settings.update({"sync": False})

    try:
        model = YOLO(str(args.path))
    except Exception as error:  # noqa: BLE001 - any load failure is reported alike
        print(f"Could not load the model: {error}", file=sys.stderr)
        return 1

    print(f"task: {model.task}")
    print(f"names: {[model.names[index] for index in sorted(model.names)]}")

    source = (
        str(args.image)
        if args.image
        else np.zeros((args.imgsz, args.imgsz, 3), np.uint8)
    )
    try:
        model.predict(source, imgsz=args.imgsz, verbose=False)
    except Exception as error:  # noqa: BLE001 - any predict failure is reported alike
        print(f"Prediction failed: {error}", file=sys.stderr)
        return 2

    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
