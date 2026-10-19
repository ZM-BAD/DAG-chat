"""Shared utilities for API routes and services."""

import functools
import logging
from collections.abc import Callable
from typing import Any

from fastapi.responses import JSONResponse

from backend.models.error_codes import make_error_response

logger = logging.getLogger(__name__)


def error_response(
    status_code: int,
    error_code: str,
    data: Any = None,
    params: dict | None = None,
) -> JSONResponse:
    """Return a structured JSON error with a meaningful HTTP status code."""
    return JSONResponse(
        status_code=status_code,
        content=make_error_response(status_code, error_code, data, params),
    )


def try_or[T](primary: Callable[[], T], fallback: T, tag: str) -> T:
    """Try *primary*, fall back to *fallback* on any exception.

    Use this for graceful degradation patterns — when a best-effort operation
    can fail for unknown reasons and the caller already has a safe fallback.
    """
    try:
        return primary()
    except Exception:
        logger.exception("'%s' failed, using fallback", tag)
        return fallback


def safe_endpoint(error_code: str):
    """Decorator: wrap a FastAPI route handler with a top-level error boundary.

    Any unhandled exception is caught, logged, and converted to a structured
    error response.  Use this on every public API endpoint so the client never
    sees a bare 500 with a traceback.
    """

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except Exception:
                logger.exception("API endpoint '%s' failed", fn.__name__)
                return error_response(500, error_code)

        return wrapper

    return decorator
