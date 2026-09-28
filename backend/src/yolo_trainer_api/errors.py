"""Error handlers ensuring every error body is `{"detail": "<plain English>"}` (D-05)."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _format_validation_error(error: dict) -> str:
    loc = list(error.get("loc", ()))
    # Drop the leading "body" location element - it's noise for API consumers.
    if loc and loc[0] == "body":
        loc = loc[1:]
    field = ".".join(str(part) for part in loc)
    message = str(error.get("msg", "invalid value"))
    if message.startswith("Value error, "):
        message = message[len("Value error, ") :]
    if field:
        return f"{field}: {message}"
    return message


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        detail = "; ".join(_format_validation_error(err) for err in exc.errors())
        return JSONResponse(status_code=422, content={"detail": detail or "Invalid request."})
