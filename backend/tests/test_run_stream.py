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
from pathlib import Path

from fastapi.sse import ServerSentEvent
from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training.stream import progress_frames
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
