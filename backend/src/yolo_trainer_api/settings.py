"""Typed application settings sourced from environment variables."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration.

    No `.env` file loading here: compose passes `DATA_DIR=/data` explicitly to
    the container, and native dev uses the default `./data` (or a manually
    exported `DATA_DIR`). Host-side `.env` values (BIND_ADDR, PORT) are
    consumed by docker-compose.yml itself, not by this application.
    """

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    data_dir: Path = Path("data")

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def async_database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.db_path.resolve().as_posix()}"

    @property
    def sync_database_url(self) -> str:
        return f"sqlite:///{self.db_path.resolve().as_posix()}"
