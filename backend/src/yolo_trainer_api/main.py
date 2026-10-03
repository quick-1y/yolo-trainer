"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import select
from starlette.middleware.trustedhost import TrustedHostMiddleware

from yolo_trainer_api.db import checkpoint_wal, create_engine_for, create_sessionmaker
from yolo_trainer_api.errors import register_error_handlers
from yolo_trainer_api.migrate import run_migrations
from yolo_trainer_api.models import Image, Project
from yolo_trainer_api.routers.classes import router as classes_router
from yolo_trainer_api.routers.config import router as config_router
from yolo_trainer_api.routers.images import router as images_router
from yolo_trainer_api.routers.projects import router as projects_router
from yolo_trainer_api.settings import Settings, validate_data_dir
from yolo_trainer_api.storage import reconcile_orphans

logger = logging.getLogger(__name__)


async def _cleanup_orphans(app: FastAPI, settings: Settings) -> None:
    """Remove leftovers of crashes and deleted projects; never blocks startup."""
    try:
        async with app.state.sessionmaker() as session:
            project_ids = set((await session.execute(select(Project.id))).scalars().all())
            image_rows = await session.execute(select(Image.project_id, Image.id, Image.ext))
            image_keys = {(row.project_id, row.id, row.ext) for row in image_rows.all()}
        await asyncio.to_thread(reconcile_orphans, settings, project_ids, image_keys)
    except Exception:
        logger.exception("Orphan file cleanup failed; continuing startup")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Fail fast on a bad DATA_DIR (RESEARCH Security V12) before touching
        # migrations. Startup runs `alembic upgrade head` (it never creates or
        # drops tables through metadata) and may delete orphaned files under
        # data/projects/ only - never anything else (D-19, D-20).
        validate_data_dir(settings)
        # Single api replica in v1 - no concurrent-migration race (D-20).
        await asyncio.to_thread(run_migrations, settings)

        engine = create_engine_for(settings)
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)

        await _cleanup_orphans(app, settings)

        yield

        # Checkpoint the WAL before disposing the engine so app.db-wal is
        # absent/empty on graceful shutdown (RESEARCH Pitfall 1 mitigation 2).
        await checkpoint_wal(engine, settings.sqlite_journal_mode)
        await engine.dispose()

    app = FastAPI(title="YOLO Trainer API", lifespan=lifespan)
    app.state.settings = settings

    # T-02-01: reject requests whose Host header isn't allow-listed - blunts
    # DNS-rebinding against this local, unauthenticated API (D-14).
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

    register_error_handlers(app)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(projects_router)
    app.include_router(images_router)
    app.include_router(classes_router)
    app.include_router(config_router)

    return app


app = create_app()
