"""Request-level security dependencies."""

from __future__ import annotations

from fastapi import HTTPException, Request


async def require_xhr(request: Request) -> None:
    """Refuse requests that lack the custom `X-Requested-With` header.

    A `multipart/form-data` POST is a CORS "simple request": any page open in
    the user's browser could send it without a preflight. A custom header
    forces a preflight, which fails because the api has no CORS middleware.
    `Sec-Fetch-Site` is not used: browsers do not send it to LAN http origins.
    """
    if not request.headers.get("x-requested-with", "").strip():
        raise HTTPException(status_code=403, detail="Missing required request header.")
