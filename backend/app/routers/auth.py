"""Auth router — login / logout / status for profile-based Azure auth.

Authentication flow:
  1. Frontend creates a profile (POST /api/profiles)
  2. Frontend sends credentials (POST /api/auth/login)
  3. Backend authenticates against Azure AD & stores credential in memory
  4. All subsequent API calls include X-Profile-Id header
  5. Backend resolves credential from the in-memory store
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import CustomerProfileDB
from app.dependencies import get_db
from app.services import credential_store
from app.services.azure_auth import SCOPE_ARM, SCOPE_GRAPH

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

AUTH_FAILURE_MESSAGE = "Authentication failed"
DEVICE_CODE_START_FAILURE_MESSAGE = "Failed to start interactive sign-in"


# ---- Request / Response models ---------------------------------------------


class LoginRequest(BaseModel):
    """Credentials for authenticating a profile against an Azure tenant."""
    profile_id: int
    tenant_id: str
    auth_type: str = "user_password"  # "user_password" | "service_principal"
    username: Optional[str] = None     # for user_password
    password: Optional[str] = None     # for user_password
    client_id: Optional[str] = None    # for service_principal (or custom ROPC client)
    client_secret: Optional[str] = None  # for service_principal


class DeviceCodeStartRequest(BaseModel):
    """Start an interactive device-code login for an Azure tenant."""
    profile_id: int
    tenant_id: str


class DeviceCodePollRequest(BaseModel):
    """Poll a pending device-code flow for completion."""
    profile_id: int


class AuthStatusResponse(BaseModel):
    profile_id: int
    authenticated: bool
    username: Optional[str] = None
    tenant_id: Optional[str] = None
    auth_type: Optional[str] = None
    available_scopes: Optional[list[str]] = None


# ---- Endpoints -------------------------------------------------------------


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate a profile against Azure AD.

    Supports two auth types:
    - **user_password**: Azure AD username + password (ROPC flow)
    - **service_principal**: Client ID + Client Secret (client credentials)
    """
    # Verify profile exists
    profile = await db.get(CustomerProfileDB, body.profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    try:
        if body.auth_type == "service_principal":
            if not body.client_id or not body.client_secret:
                raise HTTPException(400, detail="client_id and client_secret required for service_principal auth")
            result = credential_store.authenticate_service_principal(
                profile_id=body.profile_id,
                tenant_id=body.tenant_id,
                client_id=body.client_id,
                client_secret=body.client_secret,
            )
        else:
            # Default: user_password (ROPC)
            if not body.username or not body.password:
                raise HTTPException(400, detail="username and password required")
            result = credential_store.authenticate_username_password(
                profile_id=body.profile_id,
                tenant_id=body.tenant_id,
                username=body.username,
                password=body.password,
                client_id=body.client_id,  # optional custom client_id for ROPC
            )

        # Update profile with tenant info
        profile.tenant_id = body.tenant_id
        profile.status = "Active"

        # Deactivate other profiles
        from sqlalchemy import select
        from datetime import datetime, timezone
        others = await db.execute(
            select(CustomerProfileDB).where(
                CustomerProfileDB.status == "Active",
                CustomerProfileDB.id != body.profile_id,
            )
        )
        for other in others.scalars().all():
            other.status = "Cached"
        profile.updated_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "success": True,
            "profile_id": body.profile_id,
            **result,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Authentication failed for profile %d", body.profile_id)
        raise HTTPException(
            401,
            detail=AUTH_FAILURE_MESSAGE,
        ) from exc


@router.get("/status/{profile_id}", response_model=AuthStatusResponse)
async def auth_status(profile_id: int):
    """Check whether a profile has active, still-usable credentials."""
    info = credential_store.get_auth_info(profile_id)
    if info:
        # Validate token acquisition to avoid stale "Connected" states
        # when the in-memory credential exists but silent refresh fails.
        scopes_to_probe = [SCOPE_ARM]
        if info.available_scopes and SCOPE_GRAPH in info.available_scopes:
            scopes_to_probe.append(SCOPE_GRAPH)

        for scope in scopes_to_probe:
            token = credential_store.get_token_for_scope(profile_id, scope)
            if not token:
                credential_store.remove_credential(profile_id)
                return AuthStatusResponse(profile_id=profile_id, authenticated=False)

        return AuthStatusResponse(
            profile_id=profile_id,
            authenticated=True,
            username=info.username,
            tenant_id=info.tenant_id,
            auth_type=info.auth_type,
            available_scopes=info.available_scopes,
        )
    return AuthStatusResponse(profile_id=profile_id, authenticated=False)


@router.get("/status")
async def all_auth_status():
    """Return auth status for all profiles with stored credentials."""
    ids = credential_store.list_authenticated_profiles()
    results = []
    for pid in ids:
        info = credential_store.get_auth_info(pid)
        if info:
            scopes_to_probe = [SCOPE_ARM]
            if info.available_scopes and SCOPE_GRAPH in info.available_scopes:
                scopes_to_probe.append(SCOPE_GRAPH)
            healthy = all(credential_store.get_token_for_scope(pid, scope) for scope in scopes_to_probe)
            if not healthy:
                credential_store.remove_credential(pid)
                continue
        results.append({
            "profile_id": pid,
            "authenticated": True,
            "username": info.username if info else None,
            "tenant_id": info.tenant_id if info else None,
        })
    return {"profiles": results}


@router.post("/logout/{profile_id}")
async def logout(profile_id: int):
    """Clear stored credentials for a profile."""
    credential_store.remove_credential(profile_id)
    return {"success": True, "message": f"Credentials cleared for profile {profile_id}"}


# ── Device-code (interactive / MFA) flow ─────────────────────────────


@router.post("/device-code/start")
async def device_code_start(body: DeviceCodeStartRequest, db: AsyncSession = Depends(get_db)):
    """Start a device-code flow for interactive Azure AD login.

    Returns a ``user_code`` and ``verification_uri`` that the user must
    open in a browser to authenticate (supports MFA / Conditional Access).
    The backend polls Azure AD in the background — call ``/device-code/poll``
    to check completion.
    """
    profile = await db.get(CustomerProfileDB, body.profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    try:
        result = credential_store.start_device_code_flow(
            profile_id=body.profile_id,
            tenant_id=body.tenant_id,
        )
        return result
    except Exception as exc:
        logger.exception("Device-code start failed for profile %d", body.profile_id)
        raise HTTPException(500, detail=DEVICE_CODE_START_FAILURE_MESSAGE) from exc


@router.post("/device-code/poll")
async def device_code_poll(body: DeviceCodePollRequest, db: AsyncSession = Depends(get_db)):
    """Poll a pending device-code flow for completion.

    Returns ``status``: ``"pending"`` | ``"complete"`` | ``"error"`` | ``"not_started"``.
    On ``"complete"``, the backend has stored the credential and probed
    available scopes — the profile is ready for data collection.
    """
    result = credential_store.poll_device_code_flow(body.profile_id)

    if result.get("status") == "complete":
        # Mark profile as active
        profile = await db.get(CustomerProfileDB, body.profile_id)
        if profile:
            profile.tenant_id = result.get("tenant_id", profile.tenant_id)
            profile.status = "Active"

            from sqlalchemy import select
            from datetime import datetime, timezone

            others = await db.execute(
                select(CustomerProfileDB).where(
                    CustomerProfileDB.status == "Active",
                    CustomerProfileDB.id != body.profile_id,
                )
            )
            for other in others.scalars().all():
                other.status = "Cached"
            profile.updated_at = datetime.now(timezone.utc)
            await db.commit()

    return result


@router.post("/device-code/cancel")
async def device_code_cancel(body: DeviceCodePollRequest):
    """Cancel a pending device-code flow."""
    cancelled = credential_store.cancel_device_code_flow(body.profile_id)
    return {"cancelled": cancelled}


@router.post("/validate")
async def validate_token():
    """Legacy validation endpoint — kept for backwards compatibility."""
    return {"valid": True, "message": "Use /api/auth/login for profile-based auth."}
