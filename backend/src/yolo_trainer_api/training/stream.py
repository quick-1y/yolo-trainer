"""Live progress of a training run as Server-Sent Events (TRAN-05, D-02).

The training subprocess appends events to `progress.jsonl`; this module tails that file and
turns each complete line into a `progress` frame. Nothing here holds a database session while
the stream is open: the ownership check and every status read use their own short session
(a request-scoped session would stay open for the whole stream).
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.sse import ServerSentEvent
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from yolo_trainer_api.models import TrainingRun
from yolo_trainer_api.routers.projects import get_project_or_404
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_common.progress import ProgressTail, compact_replay, enrich_event

TERMINAL_STATUSES = frozenset({"completed", "failed", "interrupted", "cancelled"})

# The TrainingRun columns a `status` frame carries; later plans add keys here. The failure
# category lets a page that is open when its run fails show the categorized alert at once.
STATUS_COLUMNS = (
    TrainingRun.status,
    TrainingRun.epoch,
    TrainingRun.epochs,
    TrainingRun.error_category,
)

ReadStatus = Callable[[], Awaitable[dict | None]]


@dataclass(frozen=True)
class StreamTarget:
    project_id: int
    run_id: int
    task_type: str
    progress_path: Path


async def stream_target(project_id: int, run_id: int, request: Request) -> StreamTarget:
    """Resolve the run of this project or answer 404, before any stream byte is sent.

    A plain (non-yield) dependency with one short session: a yielded session would be held
    open by FastAPI for the whole lifetime of the stream.
    """
    async with request.app.state.sessionmaker() as session:
        await get_project_or_404(session, project_id)
        run = (
            await session.execute(
                select(TrainingRun.id, TrainingRun.task_type).where(
                    TrainingRun.id == run_id, TrainingRun.project_id == project_id
                )
            )
        ).first()
    if run is None:
        raise HTTPException(status_code=404, detail=service.RUN_NOT_FOUND_DETAIL)
    data_dir = request.app.state.settings.data_dir
    return StreamTarget(
        project_id=project_id,
        run_id=run.id,
        task_type=run.task_type,
        progress_path=layout.run_dir(data_dir, run.id) / layout.PROGRESS_FILE,
    )


def parse_last_event_id(raw: str | None, size: int) -> int:
    """The offset to resume at from a `Last-Event-ID` header, or 0 to replay everything.

    Only a plain run of ASCII digits no larger than the file counts; anything else (absent,
    signed, padded, exponent, longer than the file) restarts at 0. The header is client input.
    """
    if raw is None or len(raw) > 18 or re.fullmatch(r"[0-9]+", raw) is None:
        return 0
    value = int(raw)
    return value if value <= size else 0


def status_payload(row) -> dict:
    return {
        "status": row.status,
        "epoch": row.epoch,
        "epochs": row.epochs,
        "error_category": row.error_category,
    }


async def read_run_status(sessionmaker: async_sessionmaker, run_id: int) -> dict | None:
    """The `status` frame data of a run in its own short session; None once the row is gone."""
    async with sessionmaker() as session:
        row = (
            await session.execute(select(*STATUS_COLUMNS).where(TrainingRun.id == run_id))
        ).first()
    return None if row is None else status_payload(row)


async def progress_frames(
    progress_path: Path,
    offset: int,
    task_type: str,
    read_status: ReadStatus,
    *,
    file_tick: float = 0.5,
    status_every: int = 3,
) -> AsyncIterator[ServerSentEvent]:
    """Replay `progress_path` from `offset`, then follow it until the run is over.

    Frames: `progress` (id = byte offset just after its line), `status` (on connect and on
    change) and one final `end`. A partial last line is never sent; it is sent once its
    newline has arrived. Once the run is terminal the file is drained, the last `status` is
    sent and the stream ends; a run row that disappears ends it too.
    """
    tail = ProgressTail()
    tail.offset = offset
    last_status: dict | None = None
    tick = 0

    async def file_frames() -> list[ServerSentEvent]:
        lines = await asyncio.to_thread(tail.read_new_lines, progress_path)
        # The first read is the replay; later reads are small and follow the same rule.
        lines = compact_replay(lines)
        return [
            ServerSentEvent(
                event="progress", id=str(end_offset), data=enrich_event(task_type, event)
            )
            for end_offset, event in lines
        ]

    while True:
        if tick % status_every == 0:
            payload = await read_status()
            if payload is None:
                yield ServerSentEvent(event="end", data={"status": None})
                return
            if payload["status"] in TERMINAL_STATUSES:
                for frame in await file_frames():
                    yield frame
                if payload != last_status:
                    yield ServerSentEvent(event="status", data=payload)
                yield ServerSentEvent(event="end", data={"status": payload["status"]})
                return
            if payload != last_status:
                last_status = payload
                yield ServerSentEvent(event="status", data=payload)
        tick += 1
        for frame in await file_frames():
            yield frame
        await asyncio.sleep(file_tick)
