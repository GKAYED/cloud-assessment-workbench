"""Single-operator local API session. This is not a multi-user authorization system."""
from __future__ import annotations

import secrets
import time
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

from app.config import settings

router = APIRouter(prefix="/api/session", tags=["local-session"])
_unlock_key = ""
_session = ""
_expires_at = 0.0
SESSION_SECONDS = 8 * 60 * 60


def _clear_cloud_credentials() -> None:
    from app.services import credential_store
    for profile_id in list(credential_store._pending_flows):
        credential_store.cancel_device_code_flow(profile_id)
    for profile_id in list(credential_store._store):
        credential_store.remove_credential(profile_id)


def lock_session() -> None:
    global _session, _expires_at
    _session, _expires_at = "", 0.0
    _clear_cloud_credentials()


def initialize_local_session() -> None:
    """Rotate unlock/session credentials on each process start; never log the key."""
    global _unlock_key
    lock_session()
    _unlock_key = secrets.token_urlsafe(32)
    key_path = Path(settings.local_unlock_key_path).expanduser().resolve()
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.write_text(_unlock_key, encoding="utf-8")
    key_path.chmod(0o600)


def valid_session(token: str) -> bool:
    if _session and time.monotonic() >= _expires_at:
        lock_session()
    return bool(_session and token and secrets.compare_digest(token, _session))


class UnlockRequest(BaseModel):
    key: str = Field(min_length=1, max_length=128)


@router.post("/unlock")
async def unlock(body: UnlockRequest):
    global _session, _expires_at
    if not _unlock_key or not secrets.compare_digest(body.key, _unlock_key):
        raise HTTPException(401, "Invalid local unlock key")
    lock_session()
    _session = secrets.token_urlsafe(32)
    _expires_at = time.monotonic() + SESSION_SECONDS
    return {"token": _session, "expires_in": SESSION_SECONDS}


@router.post("/lock")
async def lock():
    lock_session()
    return {"locked": True}


class LocalSessionMiddleware:
    """Protect API/docs, enforce loopback Host and trusted browser Origin.

    A valid local operator session can access every local customer profile.
    Profile IDs are selectors only. No session token is accepted in a URL.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        host = urlsplit("//" + headers.get("host", "")).hostname
        origin = headers.get("origin")
        allowed_origins = {x.strip() for x in settings.cors_origins.split(",")}
        error = None
        status = 403
        if host not in {"localhost", "127.0.0.1", "::1"}:
            error = "Only local workstation access is supported"
        elif origin is not None and origin not in allowed_origins:
            error = "Untrusted request origin"
        elif scope["method"] == "OPTIONS":
            return await self.app(scope, receive, send)
        elif scope["path"] in {"/api/auth/login", "/api/auth/validate"}:
            error, status = "Use Microsoft device-code sign-in", 404
        elif scope["path"] not in {"/health", "/api/session/unlock"}:
            if not valid_session(headers.get("x-workbench-session", "")):
                error, status = "Local session required or expired", 401
        if error:
            response = JSONResponse({"detail": error}, status_code=status)
            response.headers["Cache-Control"] = "no-store"
            return await response(scope, receive, send)
        return await self.app(scope, receive, send)
