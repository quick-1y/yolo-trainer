"""Pure helpers of `yolo_trainer_common.progress`: JSON conversion, JSONL tailing, log cleaning.

No database, no torch: tensor-likes are duck-typed fakes (Phase 0 follow-up #5a,
Pitfalls 1, 10 and 11).
"""

from __future__ import annotations

import json
from pathlib import Path

from yolo_trainer_common.progress import (
    CHECKPOINT_ENDED,
    CHECKPOINT_RESUMABLE,
    CHECKPOINT_UNKNOWN,
    EVENT_BATCH_PROGRESS,
    EVENT_FIT_EPOCH_END,
    EVENT_MODEL_SAVE,
    EVENT_TRAIN_EPOCH_END,
    EVENT_TRAIN_START,
    LOG_TAIL_LINES,
    SCHEMA_VERSION,
    ProgressTail,
    checkpoint_state,
    clean_log_tail,
    compact_replay,
    enrich_event,
    jsonable,
    map50_key,
    primary_metrics,
    read_checkpoint_state,
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


def test_read_new_lines_returns_complete_lines_with_the_offset_after_each_newline(
    tmp_path: Path,
) -> None:
    path = tmp_path / "progress.jsonl"
    tail = ProgressTail()
    path.write_bytes(b'{"n": 1}\n{"n": 2}\n{"n": ')

    assert tail.read_new_lines(path) == [(9, {"n": 1}), (18, {"n": 2})]
    assert tail.read_new_lines(path) == []  # the unterminated line stays for later
    with path.open("ab") as handle:
        handle.write(b"3}\n")
    assert tail.read_new_lines(path) == [(path.stat().st_size, {"n": 3})]
    assert path.stat().st_size == 27


def test_read_new_lines_starts_at_the_offset_and_skips_undecodable_lines(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_bytes(b'{"n": 1}\n\xff\xfe\n{"n": 3}\n')
    tail = ProgressTail()
    tail.offset = 9

    assert tail.read_new_lines(path) == [(21, {"n": 3})]
    tail.offset = 0
    assert tail.read_new_lines(path) == [(9, {"n": 1}), (21, {"n": 3})]


def test_enrich_event_adds_primary_numbers_only_to_a_fit_epoch_end() -> None:
    fit = {
        "event": EVENT_FIT_EPOCH_END,
        "epoch": 1,
        "metrics": {"metrics/mAP50(M)": 0.4, "metrics/mAP50(B)": 0.9},
    }

    detect = enrich_event("detect", fit)
    segment = enrich_event("segment", fit)

    assert detect["primary"]["map50"] == 0.9
    assert segment["primary"]["map50"] == 0.4
    assert "primary" not in fit  # a copy, not an in-place edit
    assert enrich_event("detect", {"event": "train_epoch_end", "epoch": 1}) == {
        "event": "train_epoch_end",
        "epoch": 1,
    }
    assert enrich_event("detect", {"event": EVENT_FIT_EPOCH_END})["primary"]["map50"] is None


def _item(offset: int, event: str, **fields: object) -> tuple[int, dict]:
    return offset, {"event": event, **fields}


def test_compact_replay_keeps_only_the_last_batch_progress_in_order() -> None:
    items = [
        _item(10, EVENT_TRAIN_EPOCH_END, epoch=1),
        _item(20, EVENT_BATCH_PROGRESS, epoch=1, batch=1),
        _item(30, EVENT_BATCH_PROGRESS, epoch=1, batch=2),
        _item(40, EVENT_FIT_EPOCH_END, epoch=1),
        _item(50, EVENT_BATCH_PROGRESS, epoch=2, batch=1),
    ]

    assert [offset for offset, _ in compact_replay(items)] == [10, 40, 50]
    assert compact_replay(items)[-1][1]["batch"] == 1  # keeps its own offset and content


def test_compact_replay_leaves_a_list_without_batch_events_unchanged() -> None:
    items = [_item(10, EVENT_TRAIN_START), _item(20, EVENT_FIT_EPOCH_END, epoch=1)]

    assert compact_replay(items) == items
    assert compact_replay([]) == []
    assert SCHEMA_VERSION == 2


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


def _phase4_events(saved: int, *, final: bool = False) -> list[dict]:
    """Events as Phase 4 wrote them: no `v`, no `train_start`, no `last_epoch`."""
    events: list[dict] = []
    for epoch in range(1, saved + 1):
        events.append({"event": EVENT_TRAIN_EPOCH_END, "epoch": epoch, "epochs": 10})
        events.append({"event": EVENT_MODEL_SAVE, "epoch": epoch, "last": "l", "best": "b"})
        events.append(
            {"event": EVENT_FIT_EPOCH_END, "epoch": epoch, "epochs": 10, "final_validation": False}
        )
    if final:
        events.append(
            {"event": EVENT_FIT_EPOCH_END, "epoch": saved, "epochs": 10, "final_validation": True}
        )
    return events


def test_checkpoint_state_of_phase4_events_is_the_last_saved_epoch_below_the_total() -> None:
    assert checkpoint_state(_phase4_events(3), 10) == (CHECKPOINT_RESUMABLE, 3)


def test_checkpoint_state_is_ended_after_the_final_validation_or_a_save_at_the_last_epoch() -> None:
    assert checkpoint_state(_phase4_events(3, final=True), 10) == (CHECKPOINT_ENDED, None)
    saved_last = [{"event": EVENT_MODEL_SAVE, "epoch": 10, "last": "l", "best": "b"}]
    assert checkpoint_state(saved_last, 10) == (CHECKPOINT_ENDED, None)


def test_checkpoint_state_is_ended_once_a_v2_epoch_reports_last_epoch() -> None:
    events = [
        {"v": 2, "event": EVENT_MODEL_SAVE, "epoch": 4},
        {"v": 2, "event": EVENT_FIT_EPOCH_END, "epoch": 4, "last_epoch": True},
    ]

    assert checkpoint_state(events, 10) == (CHECKPOINT_ENDED, None)  # an early stop


def test_checkpoint_state_follows_a_resumed_segment_and_its_train_start() -> None:
    events = [
        {"v": 2, "event": EVENT_TRAIN_START, "start_epoch": 0, "resumed": False},
        {"v": 2, "event": EVENT_MODEL_SAVE, "epoch": 2},
        {"v": 2, "event": EVENT_TRAIN_START, "start_epoch": 2, "resumed": True},
        {"v": 2, "event": EVENT_MODEL_SAVE, "epoch": 3},
    ]

    assert checkpoint_state(events, 10) == (CHECKPOINT_RESUMABLE, 3)
    # a resumed segment that was killed before its first save still knows the epoch it loaded
    assert checkpoint_state(events[:3], 10) == (CHECKPOINT_RESUMABLE, 2)


def test_checkpoint_state_reopens_after_a_segment_that_had_ended() -> None:
    events = [
        {"event": EVENT_MODEL_SAVE, "epoch": 4},
        {"event": EVENT_FIT_EPOCH_END, "epoch": 4, "last_epoch": True},
        {"event": EVENT_TRAIN_START, "start_epoch": 4, "resumed": True},
    ]

    assert checkpoint_state(events, 10) == (CHECKPOINT_RESUMABLE, 4)


def test_checkpoint_state_is_unknown_without_a_save_or_a_resumed_start() -> None:
    assert checkpoint_state([], 10) == (CHECKPOINT_UNKNOWN, None)
    only_start = [{"v": 2, "event": EVENT_TRAIN_START, "start_epoch": 0, "resumed": False}]
    assert checkpoint_state(only_start, 10) == (CHECKPOINT_UNKNOWN, None)
    # an unknown planned total never makes a save look like the last one
    assert checkpoint_state([{"event": EVENT_MODEL_SAVE, "epoch": 50}], None) == (
        CHECKPOINT_RESUMABLE,
        50,
    )
    assert checkpoint_state([{"event": EVENT_MODEL_SAVE, "epoch": "x"}], 10) == (
        CHECKPOINT_UNKNOWN,
        None,
    )


def test_read_checkpoint_state_reads_the_file_and_skips_undecodable_lines(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    lines = [json.dumps(event) for event in _phase4_events(2)]
    body = [lines[0], "{not json", *lines[1:]]
    path.write_text("\n".join(body) + "\n", encoding="utf-8")

    assert read_checkpoint_state(path, 5) == (CHECKPOINT_RESUMABLE, 2)


def test_read_checkpoint_state_of_a_missing_file_is_unknown(tmp_path: Path) -> None:
    assert read_checkpoint_state(tmp_path / "missing.jsonl", 5) == (CHECKPOINT_UNKNOWN, None)
