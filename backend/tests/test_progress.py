"""Pure helpers of `yolo_trainer_common.progress`: JSON conversion, JSONL tailing, log cleaning.

No database, no torch: tensor-likes are duck-typed fakes (Phase 0 follow-up #5a,
Pitfalls 1, 10 and 11).
"""

from __future__ import annotations

import json
from pathlib import Path

from yolo_trainer_common.progress import (
    LOG_TAIL_LINES,
    ProgressTail,
    clean_log_tail,
    jsonable,
    map50_key,
    primary_metrics,
)

ESC = chr(27)
CR = chr(13)


class FakeTensor:
    """What `.detach().cpu().tolist()` is called on in Ultralytics' loss tensors."""

    def __init__(self, values: list[float]) -> None:
        self.values = values

    def detach(self) -> FakeTensor:
        return self

    def cpu(self) -> FakeTensor:
        return self

    def tolist(self) -> list[float]:
        return self.values


class FakeScalar:
    def __init__(self, value: float) -> None:
        self.value = value

    def item(self) -> float:
        return self.value


def test_jsonable_walks_nested_values_and_unwraps_tensor_likes() -> None:
    converted = jsonable(
        {"tloss": FakeTensor([1.0, float("nan")]), "n": [1, (2, 3)], "x": FakeScalar(0.5)}
    )

    assert converted == {"tloss": [1.0, None], "n": [1, [2, 3]], "x": 0.5}
    json.dumps(converted, allow_nan=False)


def test_jsonable_turns_infinity_into_null_and_unknown_objects_into_text() -> None:
    class Odd:
        def __str__(self) -> str:
            return "odd thing"

    assert jsonable(
        {"inf": float("inf"), "neg": float("-inf"), "odd": Odd(), "flag": True, 4: None}
    ) == {"inf": None, "neg": None, "odd": "odd thing", "flag": True, "4": None}


def test_the_progress_tail_consumes_a_partial_last_line_only_once_complete(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    tail = ProgressTail()
    path.write_text('{"n": 1}\n{"n": ', encoding="utf-8")

    assert tail.read_new_events(path) == [{"n": 1}]
    assert tail.read_new_events(path) == []  # the half line stays for later
    with path.open("a", encoding="utf-8") as handle:
        handle.write("2}\n")
    assert tail.read_new_events(path) == [{"n": 2}]
    assert tail.read_new_events(path) == []


def test_the_progress_tail_skips_an_undecodable_line_and_keeps_going(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    tail = ProgressTail()
    path.write_bytes(b'{"n": 1}\n\xff\xfe\n{"n": 3}\n')

    assert tail.read_new_events(path) == [{"n": 1}, {"n": 3}]


def test_clean_log_tail_strips_escape_codes_and_progress_fragments() -> None:
    lines = [f"{ESC}[31mline {number}{ESC}[0m{CR} {number}%{CR}" for number in range(80)]

    tail = clean_log_tail("\n".join(lines))

    kept = tail.splitlines()
    assert len(kept) == LOG_TAIL_LINES == 50
    assert ESC not in tail and CR not in tail
    assert all(line.strip() for line in kept)
    assert kept[-1].strip() == "79%"


def test_primary_metrics_pick_the_box_family_for_detect_and_the_mask_family_for_segment() -> None:
    metrics = {
        "metrics/precision(B)": 0.1,
        "metrics/recall(B)": 0.2,
        "metrics/mAP50(B)": 0.3,
        "metrics/mAP50-95(B)": 0.4,
        "metrics/precision(M)": 0.5,
        "metrics/recall(M)": 0.6,
        "metrics/mAP50(M)": 0.7,
        "metrics/mAP50-95(M)": 0.8,
    }

    assert primary_metrics("detect", metrics) == {
        "precision": 0.1,
        "recall": 0.2,
        "map50": 0.3,
        "map50_95": 0.4,
    }
    assert primary_metrics("segment", metrics) == {
        "precision": 0.5,
        "recall": 0.6,
        "map50": 0.7,
        "map50_95": 0.8,
    }
    assert map50_key("detect") == "metrics/mAP50(B)"
    assert map50_key("segment") == "metrics/mAP50(M)"


def test_primary_metrics_report_missing_or_non_finite_values_as_none() -> None:
    nothing = dict.fromkeys(("precision", "recall", "map50", "map50_95"))

    assert primary_metrics("segment", {"metrics/mAP50(B)": 0.9}) == nothing
    assert primary_metrics("detect", None) == nothing
    assert primary_metrics("detect", {"metrics/mAP50(B)": float("nan")})["map50"] is None
