"""Official base models the service may train from (D-07).

A static allow-list: the client names a model, never a path, and the name maps
to a weights file only through this module and
`yolo_trainer_common.layout.weights_file` (T4-01). Re-verify against
`ultralytics.utils.downloads.GITHUB_ASSETS_NAMES` when the Ultralytics pin moves.
"""

from __future__ import annotations

OFFICIAL_FAMILIES = ("yolo26", "yolo11")
OFFICIAL_SIZES = ("n", "s", "m", "l", "x")


def _suffix(task_type: str) -> str:
    return "-seg" if task_type == "segment" else ""


def official_models(task_type: str) -> list[tuple[str, str]]:
    """`(name, size)` pairs: YOLO26 n..x, then YOLO11 n..x; `-seg` for segment projects."""
    suffix = _suffix(task_type)
    return [
        (f"{family}{size}{suffix}", size) for family in OFFICIAL_FAMILIES for size in OFFICIAL_SIZES
    ]


def default_official(task_type: str) -> str:
    return f"yolo26n{_suffix(task_type)}"


def is_official(name: str, task_type: str) -> bool:
    return any(name == known for known, _size in official_models(task_type))
