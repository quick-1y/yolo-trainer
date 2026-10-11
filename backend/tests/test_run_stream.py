"""The live progress stream of a run (TRAN-05, D-02).

The generator is driven directly against a temp file and a stub status reader: Starlette's
`TestClient` buffers a whole response and never returns from an endless stream, so the HTTP
layer is only exercised on runs that are already terminal and end by themselves (Pitfall 9).
"""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.sse import ServerSentEvent
from fastapi.testclient import TestClient

from yolo_trainer_api.models import TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training.stream import (
    STATUS_COLUMNS,
    parse_last_event_id,
    progress_frames,
    status_payload,
)
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_worker import queue
from yolo_trainer_worker.supervisor import Supervisor

from .training_helpers import fake_command, setup_project, start_run, wait_status, worker_settings


def _line(event: str, **fields: object) -> bytes:
    return (json.dumps({"event": event, "time": 1.0, **fields}) + "\n").encode("utf-8")


def _epoch(epoch: int, map50: float) -> bytes:
    return _line("train_epoch_end", epoch=epoch, epochs=2, tloss={"box_loss": 1.0}) + _line(
        "fit_epoch_end",
        epoch=epoch,
        epochs=2,
        final_validation=False,
        metrics={"metrics/mAP50(B)": map50, "metrics/mAP50-95(B)": map50 - 0.2},
    )


def _status(status: str) -> dict:
    return {"status": status, "epoch": 2, "epochs": 2}


def _status_reader(*payloads: dict | None, on_call=None):
    """A `read_status` stub answering the given payloads in turn, then the last one forever."""
    calls = {"count": 0}

    async def read() -> dict | None:
        index = min(calls["count"], len(payloads) - 1)
        if on_call is not None:
            on_call(calls["count"])
        calls["count"] += 1
        return payloads[index]

    return read


async def _drain(frames: AsyncIterator[ServerSentEvent], limit: int = 200) -> list[ServerSentEvent]:
    collected: list[ServerSentEvent] = []
    async for frame in frames:
        collected.append(frame)
        assert len(collected) < limit, "the stream did not end"
    return collected


def _collect(frames: AsyncIterator[ServerSentEvent], limit: int = 200) -> list[ServerSentEvent]:
    return asyncio.run(_drain(frames, limit))


def _offsets(*chunks: bytes) -> list[int]:
    total, offsets = 0, []
    for chunk in chunks:
        for line in chunk.splitlines(keepends=True):
            total += len(line)
            offsets.append(total)
    return offsets


def test_replay_sends_status_then_every_line_with_its_end_offset_then_end(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_bytes(_epoch(1, 0.5) + _epoch(2, 0.6))

    frames = _collect(
        progress_frames(
            path,
            0,
            "detect",
            _status_reader(_status("running"), _status("completed")),
            file_tick=0.01,
            status_every=1,
        )
    )

    assert [frame.event for frame in frames] == [
        "status",
        "progress",
        "progress",
        "progress",
        "progress",
        "status",
        "end",
    ]
    assert frames[0].data == _status("running")
    progress = [frame for frame in frames if frame.event == "progress"]
    assert [int(frame.id) for frame in progress] == _offsets(_epoch(1, 0.5), _epoch(2, 0.6))
    assert int(progress[-1].id) == path.stat().st_size
    fits = [frame.data for frame in progress if frame.data["event"] == "fit_epoch_end"]
    assert [fit["primary"]["map50"] for fit in fits] == [0.5, 0.6]
    assert "primary" not in progress[0].data
    assert frames[-2].data == _status("completed")
    assert frames[-1].data == {"status": "completed"}


def test_lines_appended_after_the_first_read_arrive_as_later_frames(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_bytes(_epoch(1, 0.5))

    def append_second_epoch(call: int) -> None:
        if call == 1:
            with path.open("ab") as handle:
                handle.write(_epoch(2, 0.6))

    frames = _collect(
        progress_frames(
            path,
            0,
            "detect",
            _status_reader(
                _status("running"),
                _status("running"),
                _status("completed"),
                on_call=append_second_epoch,
            ),
            file_tick=0.01,
            status_every=1,
        )
    )

    epochs = [
        frame.data["epoch"]
        for frame in frames
        if frame.event == "progress" and frame.data["event"] == "fit_epoch_end"
    ]
    assert epochs == [1, 2]
    assert frames[-1].event == "end"


def _terminal_run(client: TestClient, settings: Settings, project_name: str) -> tuple[int, int]:
    ids = setup_project(client, project_name, train=2, valid=1)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        assert queue.claim_next(engine) == run["id"]
        Supervisor(
            engine,
            worker_settings(settings),
            ComputeDevice(cuda_available=False, device="cpu", device_name=None),
            command=fake_command("success"),
            tick_seconds=0.05,
        ).run_claimed(run["id"], threading.Event())
    finally:
        engine.dispose()
    wait_status(client, ids["project_id"], run["id"], {"completed"})
    return ids["project_id"], run["id"]


def test_http_stream_of_a_completed_run_replays_the_file_and_ends(
    client: TestClient, settings: Settings
) -> None:
    project_id, run_id = _terminal_run(client, settings, "Stream")
    assert layout.run_dir(settings.data_dir, run_id).joinpath(layout.PROGRESS_FILE).is_file()

    response = client.get(f"/api/projects/{project_id}/runs/{run_id}/stream")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: progress" in body
    assert body.index("event: progress") < body.index("event: end")
    assert body.rstrip().endswith('event: end\ndata: {"status": "completed"}')


def test_http_stream_of_another_projects_run_or_an_unknown_run_is_404(
    client: TestClient, settings: Settings
) -> None:
    project_id, run_id = _terminal_run(client, settings, "Owner")
    other = setup_project(client, "Other", train=1)["project_id"]

    foreign = client.get(f"/api/projects/{other}/runs/{run_id}/stream")
    unknown = client.get(f"/api/projects/{project_id}/runs/99999/stream")

    assert foreign.status_code == 404
    assert foreign.json() == {"detail": "Run not found."}
    assert unknown.status_code == 404
    assert unknown.json() == {"detail": "Run not found."}


@pytest.mark.parametrize(
    ("raw", "size", "expected"),
    [
        (None, 500, 0),
        ("120", 500, 120),
        ("500", 500, 500),
        ("0", 500, 0),
        ("600", 500, 0),
        ("-5", 500, 0),
        ("12a", 500, 0),
        ("1e3", 500, 0),
        (" 7", 500, 0),
        ("", 500, 0),
        ("٣", 500, 0),  # an Arabic-Indic digit is not an ASCII digit
    ],
)
def test_parse_last_event_id_accepts_only_a_plain_offset_inside_the_file(
    raw: str | None, size: int, expected: int
) -> None:
    assert parse_last_event_id(raw, size) == expected


def _progress_ids(frames: list[ServerSentEvent]) -> list[int]:
    return [int(frame.id) for frame in frames if frame.event == "progress"]


def test_an_offset_taken_from_a_previous_frame_id_replays_only_later_lines(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_bytes(_epoch(1, 0.5) + _epoch(2, 0.6))
    ids = _offsets(_epoch(1, 0.5), _epoch(2, 0.6))

    frames = _collect(
        progress_frames(
            path,
            ids[1],
            "detect",
            _status_reader(_status("completed")),
            file_tick=0.01,
            status_every=1,
        )
    )

    assert _progress_ids(frames) == ids[2:]
    assert [frame.event for frame in frames][-2:] == ["status", "end"]


def test_a_half_written_last_line_is_sent_only_once_it_is_complete(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    complete = _epoch(1, 0.5)
    second = _line("train_epoch_end", epoch=2, epochs=2, tloss={"box_loss": 0.9})
    path.write_bytes(complete + second[:20])

    def finish_the_line(call: int) -> None:
        if call == 2:
            with path.open("ab") as handle:
                handle.write(second[20:])

    frames = _collect(
        progress_frames(
            path,
            0,
            "detect",
            _status_reader(
                _status("running"),
                _status("running"),
                _status("running"),
                _status("completed"),
                on_call=finish_the_line,
            ),
            file_tick=0.01,
            status_every=1,
        )
    )

    assert _progress_ids(frames) == _offsets(complete, second)
    # The half line was never sent as a broken frame: every frame is a whole event.
    assert [frame.data["epoch"] for frame in frames if frame.event == "progress"] == [1, 1, 2]


def test_a_run_row_deleted_mid_stream_ends_the_stream(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_bytes(_epoch(1, 0.5))

    frames = _collect(
        progress_frames(
            path,
            0,
            "detect",
            _status_reader(_status("running"), None),
            file_tick=0.01,
            status_every=1,
        )
    )

    assert [frame.event for frame in frames] == ["status", "progress", "progress", "end"]
    assert frames[-1].data == {"status": None}


def test_a_status_change_after_more_lines_yields_those_lines_then_status_and_end(
    tmp_path: Path,
) -> None:
    path = tmp_path / "progress.jsonl"
    path.write_bytes(_epoch(1, 0.5))

    def write_last_epoch(call: int) -> None:
        if call == 1:
            with path.open("ab") as handle:
                handle.write(_epoch(2, 0.6))

    frames = _collect(
        progress_frames(
            path,
            0,
            "detect",
            _status_reader(_status("running"), _status("completed"), on_call=write_last_epoch),
            file_tick=0.01,
            status_every=1,
        )
    )

    kinds = [frame.event for frame in frames]
    assert kinds == ["status", "progress", "progress", "progress", "progress", "status", "end"]
    assert frames[-2].data["status"] == "completed"
    assert _progress_ids(frames)[-1] == path.stat().st_size


def test_a_replay_sends_only_the_last_batch_progress_event(tmp_path: Path) -> None:
    path = tmp_path / "progress.jsonl"
    batches = b"".join(
        _line("batch_progress", epoch=1, batch=number, nb=9) for number in range(1, 6)
    )
    path.write_bytes(_line("train_start") + batches + _epoch(1, 0.5))

    frames = _collect(
        progress_frames(
            path, 0, "detect", _status_reader(_status("completed")), file_tick=0.01, status_every=1
        )
    )

    sent = [frame.data["event"] for frame in frames if frame.event == "progress"]
    assert sent == ["train_start", "batch_progress", "train_epoch_end", "fit_epoch_end"]
    batch = next(frame for frame in frames if frame.data.get("event") == "batch_progress")
    assert batch.data["batch"] == 5
    assert path.read_bytes().count(b"batch_progress") == 5  # the file itself is untouched


def _frames_of(body: str) -> list[dict[str, str]]:
    frames = []
    for block in body.strip().split("\n\n"):
        fields: dict[str, str] = {}
        for line in block.splitlines():
            key, _, value = line.partition(": ")
            fields[key] = value
        frames.append(fields)
    return frames


def test_http_headers_and_resume_by_last_event_id(client: TestClient, settings: Settings) -> None:
    project_id, run_id = _terminal_run(client, settings, "Resume")
    url = f"/api/projects/{project_id}/runs/{run_id}/stream"

    full = client.get(url)

    assert full.headers["cache-control"] == "no-cache"
    assert full.headers["x-accel-buffering"] == "no"
    frames = _frames_of(full.text)
    progress_ids = [frame["id"] for frame in frames if frame["event"] == "progress"]
    assert len(progress_ids) >= 4
    assert [frame["event"] for frame in frames][-2:] == ["status", "end"]

    garbage = client.get(url, headers={"Last-Event-ID": "abc"})
    assert _frames_of(garbage.text) == frames  # not a number: replay everything

    beyond = client.get(url, headers={"Last-Event-ID": str(10**9)})
    assert _frames_of(beyond.text) == frames  # beyond the file: replay everything

    resumed = client.get(url, headers={"Last-Event-ID": progress_ids[1]})
    resumed_frames = _frames_of(resumed.text)
    assert [frame["id"] for frame in resumed_frames if frame["event"] == "progress"] == (
        progress_ids[2:]
    )
    assert [frame["event"] for frame in resumed_frames][-2:] == ["status", "end"]


def test_the_status_frame_of_a_failed_run_carries_its_error_category(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Failing", train=2, valid=1)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        assert queue.claim_next(engine) == run["id"]
        Supervisor(
            engine,
            worker_settings(settings),
            ComputeDevice(cuda_available=False, device="cpu", device_name=None),
            command=fake_command("oom"),
            tick_seconds=0.05,
        ).run_claimed(run["id"], threading.Event())
    finally:
        engine.dispose()
    wait_status(client, ids["project_id"], run["id"], {"failed"})

    response = client.get(f"/api/projects/{ids['project_id']}/runs/{run['id']}/stream")

    frames = _frames_of(response.text)
    status = json.loads([frame for frame in frames if frame["event"] == "status"][-1]["data"])
    assert status["status"] == "failed"
    assert status["error_category"] == "out_of_memory"
    assert frames[-1]["event"] == "end"


def test_the_status_frame_says_cancelling_only_for_a_running_run_with_a_pending_cancel() -> None:
    stamp = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)

    def row(status: str, requested_at: datetime | None) -> SimpleNamespace:
        return SimpleNamespace(
            status=status,
            epoch=3,
            epochs=10,
            error_category=None,
            cancel_requested_at=requested_at,
        )

    assert status_payload(row("running", stamp))["cancelling"] is True
    assert status_payload(row("running", None))["cancelling"] is False
    assert status_payload(row("cancelled", stamp))["cancelling"] is False
    assert status_payload(row("completed", stamp))["cancelling"] is False
    # the timestamp itself never reaches the browser
    assert "cancel_requested_at" not in status_payload(row("running", stamp))
    assert TrainingRun.cancel_requested_at in STATUS_COLUMNS


def test_the_status_frame_of_a_cancelled_run_reads_cancelled_without_a_category(
    client: TestClient, settings: Settings
) -> None:
    ids = setup_project(client, "Cancelled", train=2, valid=1)
    run = start_run(client, ids["project_id"])
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    try:
        assert queue.claim_next(engine) == run["id"]
        assert queue.mark_cancelled(engine, run["id"], None) == 1
    finally:
        engine.dispose()

    response = client.get(f"/api/projects/{ids['project_id']}/runs/{run['id']}/stream")

    frames = _frames_of(response.text)
    status = json.loads([frame for frame in frames if frame["event"] == "status"][-1]["data"])
    assert status["status"] == "cancelled"
    assert status["cancelling"] is False
    assert status["error_category"] is None
    assert frames[-1]["event"] == "end"


def test_http_stream_of_an_unknown_project_is_404(client: TestClient) -> None:
    response = client.get("/api/projects/9999/runs/1/stream")

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found."}
