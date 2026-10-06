"""Reading the worker heartbeat file; shared by the worker healthcheck and the api."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

HEARTBEAT_MAX_AGE_SECONDS = 60


def read_heartbeat(path: Path) -> dict | None:
    """The heartbeat payload, or None for a missing file or invalid JSON."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def is_heartbeat_fresh(
    path: Path,
    max_age_seconds: int = HEARTBEAT_MAX_AGE_SECONDS,
    now: datetime | None = None,
) -> bool:
    """Return True if `path` holds a valid heartbeat newer than `max_age_seconds`.

    False for a missing file, invalid JSON, or a missing/unparseable
    `last_heartbeat` field.
    """
    if now is None:
        now = datetime.now(UTC)

    payload = read_heartbeat(path)
    if payload is None:
        return False
    try:
        last_heartbeat = datetime.fromisoformat(
            str(payload["last_heartbeat"]).replace("Z", "+00:00")
        )
    except (KeyError, ValueError):
        return False

    age_seconds = (now - last_heartbeat).total_seconds()
    return age_seconds < max_age_seconds
