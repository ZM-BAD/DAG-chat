"""
API error code constants.

Unified error response format across all endpoints:
- JSON API (conversation.py): {"code": N, "error_code": "...", "message": "...", "data": {}}
- SSE stream (chat.py): {"error": {"code": "...", "params": {...}}}
"""

import json


def make_error_response(
    code: int, error_code: str, data=None, params: dict | None = None
):
    """Build a standard error response with error_code and message fallback."""
    return {
        "code": code,
        "error_code": error_code,
        "message": error_code,  # fallback for old clients / debugging
        "data": data or {},
        "params": params or {},  # interpolation params for frontend i18n
    }


def make_sse_error(error_code: str, params: dict | None = None) -> str:
    """Build a SSE error data line with structured error code."""
    error_obj = {"code": error_code}
    if params:
        error_obj["params"] = params
    return f"data: {json.dumps({'error': error_obj})}\n\n"


# --- Conversation errors ---
EMPTY_CONVERSATION_ID = "EMPTY_CONVERSATION_ID"
EMPTY_USER_ID = "EMPTY_USER_ID"
EMPTY_TITLE = "EMPTY_TITLE"
TITLE_TOO_LONG = "TITLE_TOO_LONG"
CREATE_CONVERSATION_FAILED = "CREATE_CONVERSATION_FAILED"
DELETE_CONVERSATION_FAILED = "DELETE_CONVERSATION_FAILED"
RENAME_CONVERSATION_FAILED = "RENAME_CONVERSATION_FAILED"
FETCH_HISTORY_FAILED = "FETCH_HISTORY_FAILED"

# --- Chat errors ---
DB_CONNECTION_FAILED = "DB_CONNECTION_FAILED"
UNSUPPORTED_MODEL = "UNSUPPORTED_MODEL"
STREAM_RESPONSE_FAILED = "STREAM_RESPONSE_FAILED"
