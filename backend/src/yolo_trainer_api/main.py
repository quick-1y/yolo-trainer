"""FastAPI application factory."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.trustedhost import TrustedHostMiddleware

from yolo_trainer_api.db import checkpoint_wal, create_engine_for, create_sessionmaker
from yolo_trainer_api.errors import register_error_handlers
from yolo_trainer_api.migrate import run_migrations
from yolo_trainer_api.routers.images import router as images_router
from yolo_trainer_api.routers.projects import router as projects_router
from yolo_trainer_api.settings import Settings, validate_data_dir


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Fail fast on a bad DATA_DIR (RESEARCH Security V12) before touching
        # migrations. Startup only ever runs `alembic upgrade head` below -
        # no metadata-level table creation/dropping, no file deletion (D-20).
        validate_data_dir(settings)
        # Single api replica in v1 - no concurrent-migration race (D-20).
        await asyncio.to_thread(run_migrations, settings)

        engine = create_engine_for(settings)
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)

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

    return app


app = create_app()
