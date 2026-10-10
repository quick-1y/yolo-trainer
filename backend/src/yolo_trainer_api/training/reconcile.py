"""Api startup sweep for runs a restart left behind (D-13).

A `preparing` run was being materialized by an api process that no longer exists, so it
fails and loses its half-built folder. A `running` run belongs to the worker, which keeps
running when only the api restarts: it is interrupted only when the worker heartbeat is
missing or stale. Recorded PIDs are never signalled - after a container restart the number
may belong to another process.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from yolo_trainer_api.models import TrainingRun, utcnow
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.storage import remove_run_dir
from yolo_trainer_common.heartbeat import HEARTBEAT_MAX_AGE_SECONDS, is_heartbeat_fresh
from yolo_trainer_common.layout import heartbeat_file

logger = logging.getLogger(__name__)

PREPARING_INTERRUPTED_DETAIL = (
    "Dataset preparation was interrupted by a restart. Start the run again."
)
RUNNING_INTERRUPTED_DETAIL = "The service was restarted while this run was training."


async def reconcile_runs_on_startup(
    sessionmaker: async_sessionmaker, settings: Settings, now: datetime | None = None
) -> None:
    """Fail stale `preparing` runs and interrupt `running` ones without a live worker.

    Never raises: like the orphan cleanup, a problem here must not block startup.
    """
    try:
        stamp = utcnow()
        async with sessionmaker() as session:
            preparing = list(
                (
                    await session.execute(
                        select(TrainingRun.id).where(TrainingRun.status == "preparing")
                    )
                )
                .scalars()
                .all()
            )
            if preparing:
                await session.execute(
                    update(TrainingRun)
                    .where(TrainingRun.id.in_(preparing), TrainingRun.status == "preparing")
                    .values(
                        status="failed",
                        error_message=PREPARING_INTERRUPTED_DETAIL,
                        finished_at=stamp,
                    )
                )
            worker_alive = is_heartbeat_fresh(
                heartbeat_file(settings.data_dir), HEARTBEAT_MAX_AGE_SECONDS, now
            )
            if not worker_alive:
                await session.execute(
                    update(TrainingRun)
                    .where(TrainingRun.status == "running")
                    .values(
                        status="interrupted",
                        error_message=RUNNING_INTERRUPTED_DETAIL,
                        finished_at=stamp,
                    )
                )
            await session.commit()
        for run_id in preparing:
            try:
                await asyncio.to_thread(remove_run_dir, settings, run_id)
            except Exception:
                logger.exception("Could not remove the folder of interrupted run %s", run_id)
    except Exception:
        logger.exception("Run reconciliation failed; continuing startup")
