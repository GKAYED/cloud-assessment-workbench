"""Shared FastAPI dependencies.

- ``get_credential``: resolves Azure credential from the in-memory credential
  store based on the ``X-Profile-Id`` request header.
- ``get_scoped_token``: acquires a token for a specific scope (Graph, BAP, etc.)
- ``get_gap_collector``: returns a request-scoped ``DataGapCollector``.
- ``get_db``: yields an async SQLAlchemy session.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException

from app.db import get_db as _get_db  # noqa: F401 — re-export
from app.services.azure_auth import StaticTokenCredential
from app.services.data_gap_collector import DataGapCollector

# Re-export get_db so routers can `from app.dependencies import get_db`
get_db = _get_db


async def get_profile_id(x_profile_id: Optional[str] = Header(None)) -> Optional[int]:
    """Extract the active profile ID from the X-Profile-Id header."""
    if x_profile_id:
        try:
            return int(x_profile_id)
        except (ValueError, TypeError):
            return None
    return None


async def get_token(
    authorization: Optional[str] = Header(None),
    x_profile_id: Optional[str] = Header(None),
) -> str:
    """Extract Bearer token from the Authorization header.

    Resolution order:
    1. If a Bearer token is in the Authorization header → return it
    2. If a profile ID is present (credential store auth) → return a
       placeholder so that ``get_credential`` can resolve the real credential
    3. Otherwise → HTTP 401
    """
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    # Profile-based auth: real credential resolved in get_credential
    if x_profile_id:
        return "__profile__"
    raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")


async def get_credential(
    profile_id: Optional[int] = Depends(get_profile_id),
    token: str = Depends(get_token),
) -> StaticTokenCredential:
    """Return a credential for Azure SDK clients.

    Resolution order:
    1. If a profile_id is provided and has stored credentials → use those
    2. If a Bearer token is provided → wrap in StaticTokenCredential
    """
    # Try credential store first (profile-based auth)
    if profile_id is not None:
        from app.services.credential_store import get_credential as store_get
        cred = store_get(profile_id)
        if cred is not None:
            return cred  # type: ignore[return-value]
        # A profile header was provided, but no live credential exists in-memory.
        # This means the backend was restarted or the session expired.
        if token == "__profile__":
            raise HTTPException(
                status_code=401,
                detail=(
                    "Profile session is not authenticated or has expired. "
                    "Please reconnect this profile from Profiles."
                ),
            )

    # Fallback to Bearer token
    return StaticTokenCredential(token)


async def get_scoped_token(
    scope: str,
    profile_id: Optional[int] = Depends(get_profile_id),
) -> Optional[str]:
    """Acquire a token for a specific scope using the profile credential store.

    Returns the token string or None if unavailable (unauthenticated).
    """
    if profile_id is None:
        return None

    from app.services.credential_store import get_token_for_scope
    return get_token_for_scope(profile_id, scope)


async def get_gap_collector(
    profile_id: Optional[int] = Depends(get_profile_id),
) -> DataGapCollector:
    """Return a DataGapCollector scoped to the active profile.

    Gaps added to this collector are automatically persisted to a global
    in-memory store so the ``/api/data-gaps`` endpoint can retrieve them.
    """
    return DataGapCollector(profile_id=profile_id)
