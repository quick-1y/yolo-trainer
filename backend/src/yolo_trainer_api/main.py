"""FastAPI application factory."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from yolo_trainer_api.db import create_engine_for, create_sessionmaker
from yolo_trainer_api.errors import register_error_handlers
from yolo_trainer_api.migrate import run_migrations
from yolo_trainer_api.routers.projects import router as projects_router
from yolo_trainer_api.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        # Single api replica in v1 - no concurrent-migration race (D-20).
        await asyncio.to_thread(run_migrations, settings)

        engine = create_engine_for(settings)
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)

        yield

        await engine.dispose()

    app = FastAPI(title="YOLO Trainer API", lifespan=lifespan)

    register_error_handlers(app)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(projects_router)

    return app


app = create_app()
