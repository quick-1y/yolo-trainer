"""Progress events written by `train_job` and read by the worker supervisor.

Pure and torch-free (duck typing only), so the api image can import it. The
training subprocess appends one JSON object per line to `progress.jsonl`; the
supervisor tails it by byte offset and copies the interesting numbers into the
database.
"""

from __future__ import annotations

import json
import logging
import math
import re
from pathlib import Path

logger = logging.getLogger(__name__)

EVENT_TRAIN_EPOCH_END = "train_epoch_end"
EVENT_FIT_EPOCH_END = "fit_epoch_end"
EVENT_MODEL_SAVE = "model_save"
EVENT_TRAIN_END = "train_end"

LOG_TAIL_LINES = 50

_ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def jsonable(value: object) -> object:
    """Convert `value` into plain JSON data, walking containers recursively.

    Dict keys become strings; lists and tuples are walked; tensor/array-likes
    (anything with `tolist()`, after `.detach().cpu()` when those exist) and
    scalars with `item()` are unwrapped; non-finite floats become None; any
    other object becomes `str(value)`. No torch import: Ultralytics hands out
    nested dicts such as `trainer.tloss`, which a shallow converter would
    stringify (Phase 0 follow-up #5a).
    """
    if value is None or isinstance(value, bool | int | str):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [jsonable(item) for item in value]

    detach = getattr(value, "detach", None)
    if callable(detach):
        value = detach()
        cpu = getattr(value, "cpu", None)
        if callable(cpu):
            value = cpu()
    for converter_name in ("tolist", "item"):
        converter = getattr(value, converter_name, None)
        if callable(converter):
            try:
                return jsonable(converter())
            except (TypeError, ValueError, RuntimeError):
                continue
    return str(value)


class ProgressTail:
    """Incremental reader of a JSONL file.

    Keeps a byte offset and returns only complete, `\\n`-terminated lines: a
    writer may be half-way through a line, which then stays for the next read
    (Pitfall 10). An undecodable line is skipped with a warning.
    """

    def __init__(self) -> None:
        self.offset = 0

    def read_new_events(self, path: Path) -> list[dict]:
        return [event for _, event in self.read_new_lines(path)]

    def read_new_lines(self, path: Path) -> list[tuple[int, dict]]:
        """Like `read_new_events`, with the byte offset just after each line's newline.

        The offsets are absolute positions in the file, so a client can resume a stream at
        any of them (`Last-Event-ID`).
        """
        try:
            with path.open("rb") as handle:
                handle.seek(self.offset)
                chunk = handle.read()
        except FileNotFoundError:
            return []
        end = chunk.rfind(b"\n")
        if end < 0:
            return []
        start = self.offset
        self.offset += end + 1
        lines: list[tuple[int, dict]] = []
        position = 0
        for raw in chunk[:end].split(b"\n"):
            position += len(raw) + 1
            if not raw.strip():
                continue
            try:
                event = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                logger.warning("Skipping an undecodable progress line in %s", path)
                continue
            if isinstance(event, dict):
                lines.append((start + position, event))
        return lines


def _suffix(task_type: str) -> str:
    return "M" if task_type == "segment" else "B"


def map50_key(task_type: str) -> str:
    """The Ultralytics metrics key of mAP50 for the task: box for detect, mask for segment."""
    return f"metrics/mAP50({_suffix(task_type)})"


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value) if math.isfinite(value) else None


def primary_metrics(task_type: str, metrics: dict | None) -> dict[str, float | None]:
    """The four headline numbers; the metrics dict itself is stored as-is (Pitfall 1).

    YOLO26 has no `val/dfl_loss`, so nothing but the four `metrics/*(B|M)` keys
    is ever read by name.
    """
    suffix = _suffix(task_type)
    source = metrics or {}
    return {
        "precision": _number(source.get(f"metrics/precision({suffix})")),
        "recall": _number(source.get(f"metrics/recall({suffix})")),
        "map50": _number(source.get(f"metrics/mAP50({suffix})")),
        "map50_95": _number(source.get(f"metrics/mAP50-95({suffix})")),
    }


def enrich_event(task_type: str, event: dict) -> dict:
    """A shallow copy of `event`; a `fit_epoch_end` also carries its `primary` headline numbers.

    The `(B)`/`(M)` metric key mapping stays in Python, so the browser never reads
    `metrics/mAP50(B)` by name.
    """
    enriched = dict(event)
    if event.get("event") == EVENT_FIT_EPOCH_END:
        metrics = event.get("metrics")
        enriched["primary"] = primary_metrics(
            task_type, metrics if isinstance(metrics, dict) else None
        )
    return enriched


def clean_log_tail(text: str, max_lines: int = LOG_TAIL_LINES) -> str:
    """The last `max_lines` readable lines of a training log (Pitfall 11).

    tqdm output carries carriage returns and ANSI escape codes; split on both
    line endings, strip the escapes and drop empty lines.
    """
    stripped = _ANSI_ESCAPE.sub("", text)
    lines = [line.rstrip() for line in re.split(r"[\r\n]", stripped)]
    lines = [line for line in lines if line.strip()]
    return "\n".join(lines[-max_lines:])
