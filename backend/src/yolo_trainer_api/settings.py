"""Typed application settings sourced from environment variables."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration.

    No `.env` file loading here: compose passes `DATA_DIR=/data` explicitly to
    the container, and native dev uses the default `./data` (or a manually
    exported `DATA_DIR`). Host-side `.env` values (BIND_ADDR, PORT) are
    consumed by docker-compose.yml itself, not by this application.
    """

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    data_dir: Path = Path("data")

    # RESEARCH "Common Pitfalls" #1 mitigation 4: a documented escape hatch
    # for the rare case Docker Desktop's WAL/bind-mount interaction corrupts
    # data. Constrained to a Literal so the value can never be influenced by
    # request data before it reaches a PRAGMA (see db.apply_sqlite_pragmas).
    sqlite_journal_mode: Literal["WAL", "DELETE"] = "WAL"

    # T-02-01: local, unauthenticated API - only accept requests whose Host
    # header matches this allow-list (blunts DNS-rebinding attacks).
    allowed_hosts: Annotated[list[str], NoDecode] = ["localhost", "127.0.0.1"]  # noqa: RUF012

    # D-03: per-file upload cap and decoded-pixel cap. The MB cap is decimal
    # on purpose (RESEARCH Pattern 5) so it matches what users see in file
    # managers; the megapixel cap guards against decompression bombs.
    max_upload_mb: int = Field(default=50, ge=1)
    max_image_megapixels: int = Field(default=100, ge=1)
    thumbnail_size: int = Field(default=256, ge=32, le=1024)

    @field_validator("sqlite_journal_mode", mode="before")
    @classmethod
    def _normalize_journal_mode(cls, value: object) -> object:
        if isinstance(value, str):
            return value.upper()
        return value

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def _split_allowed_hosts(cls, value: object) -> object:
        """Accept a comma-separated string from ALLOWED_HOSTS, stripping blanks."""
        if isinstance(value, str):
            return [host.strip() for host in value.split(",") if host.strip()]
        return value

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1_000_000

    @property
    def max_image_pixels(self) -> int:
        return self.max_image_megapixels * 1_000_000

    @property
    def async_database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.db_path.resolve().as_posix()}"

    @property
    def sync_database_url(self) -> str:
        return f"sqlite:///{self.db_path.resolve().as_posix()}"


def validate_data_dir(settings: Settings) -> Path:
    """Resolve DATA_DIR to an absolute, writable directory or fail fast.

    RESEARCH Security V12: a bad DATA_DIR must fail loudly at startup, naming
    the offending path - never silently fall back to another location.
    """
    path = settings.data_dir.resolve()

    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise RuntimeError(f"DATA_DIR {path} is not a writable directory: {exc}") from exc

    if not path.is_dir():
        raise RuntimeError(f"DATA_DIR {path} is not a writable directory: not a directory")

    probe = path / ".write-test"
    try:
        probe.write_text("")
        probe.unlink()
    except OSError as exc:
        raise RuntimeError(f"DATA_DIR {path} is not a writable directory: {exc}") from exc

    return path
