"""In-memory credential store — maps profile_id to Azure TokenCredential.

Credentials are stored only in memory (never persisted to disk/database).
When the backend restarts, profiles show as "not authenticated" and the
user must re-enter credentials to refresh live data.

The credential store now supports **multi-scope token acquisition**.
A single set of credentials (ROPC, service principal, or interactive
device-code) can acquire tokens for ARM, Graph, Power Platform BAP,
Dataverse, and Business Central by calling ``get_token_for_scope``.
"""

from __future__ import annotations

import concurrent.futures
import logging
from dataclasses import dataclass, field
from typing import Optional

from azure.core.credentials import TokenCredential

from app.services.azure_auth import (
    AZURE_CLI_CLIENT_ID,
    PUBLIC_CLIENT_IDS,
    SCOPE_ARM,
    SCOPE_BAP,
    SCOPE_BC,
    SCOPE_DATAVERSE,
    SCOPE_GRAPH,
)

logger = logging.getLogger(__name__)

INTERACTIVE_AUTH_FAILURE_MESSAGE = "Interactive authentication failed"


@dataclass
class ProfileAuth:
    """Stored auth state for a profile."""
    credential: TokenCredential
    tenant_id: str
    username: str  # display only — password is NOT stored
    auth_type: str = "user_password"  # "user_password" | "service_principal" | "interactive"
    available_scopes: list[str] = field(default_factory=lambda: [SCOPE_ARM])


# profile_id → ProfileAuth
_store: dict[int, ProfileAuth] = {}

# ── Device-code flow pending state ───────────────────────────────────
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
_pending_flows: dict[int, dict] = {}  # profile_id → {app, flow, future, tenant_id}


def authenticate_username_password(
    profile_id: int,
    tenant_id: str,
    username: str,
    password: str,
    client_id: str | None = None,
) -> dict:
    """Authenticate using ROPC (Resource Owner Password Credentials).

    Uses Azure CLI's well-known client ID by default so no app registration
    is needed in the target tenant.  Limitations: won't work with MFA or
    federated (ADFS) accounts.

    After acquiring the primary ARM token the store probes additional scopes
    (Graph, BAP, Dataverse, BC) and records which ones succeeded so that
    downstream services know what data they can fetch.

    Returns dict with authentication result info.
    """
    from azure.identity import UsernamePasswordCredential

    # Azure CLI's well-known public client ID
    cid = client_id or "04b07795-a710-4e55-adb5-31e0c8b44b82"

    credential = UsernamePasswordCredential(
        client_id=cid,
        username=username,
        password=password,
        tenant_id=tenant_id,
    )

    # Validate by actually acquiring a token
    token = credential.get_token(SCOPE_ARM)

    # Probe additional scopes
    available = [SCOPE_ARM]
    for scope in [SCOPE_GRAPH, SCOPE_BAP, SCOPE_DATAVERSE, SCOPE_BC]:
        try:
            credential.get_token(scope)
            available.append(scope)
        except Exception:
            logger.debug("Scope %s unavailable for profile %d", scope, profile_id)

    _store[profile_id] = ProfileAuth(
        credential=credential,
        tenant_id=tenant_id,
        username=username,
        auth_type="user_password",
        available_scopes=available,
    )

    logger.info(
        "Profile %d authenticated as %s against tenant %s (scopes: %s)",
        profile_id, username, tenant_id, ", ".join(available),
    )
    return {
        "authenticated": True,
        "username": username,
        "tenant_id": tenant_id,
        "expires_on": token.expires_on,
        "available_scopes": available,
    }


def authenticate_service_principal(
    profile_id: int,
    tenant_id: str,
    client_id: str,
    client_secret: str,
) -> dict:
    """Authenticate using a service principal (client credentials flow).

    Works with any tenant where the service principal has been granted
    the necessary API permissions.  No user interaction needed.
    """
    from azure.identity import ClientSecretCredential

    credential = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )

    token = credential.get_token(SCOPE_ARM)

    # Probe additional scopes
    available = [SCOPE_ARM]
    for scope in [SCOPE_GRAPH, SCOPE_BAP, SCOPE_DATAVERSE, SCOPE_BC]:
        try:
            credential.get_token(scope)
            available.append(scope)
        except Exception:
            logger.debug("Scope %s unavailable for SP profile %d", scope, profile_id)

    _store[profile_id] = ProfileAuth(
        credential=credential,
        tenant_id=tenant_id,
        username=f"SP:{client_id}",
        auth_type="service_principal",
        available_scopes=available,
    )

    logger.info(
        "Profile %d authenticated as SP %s against tenant %s (scopes: %s)",
        profile_id, client_id, tenant_id, ", ".join(available),
    )
    return {
        "authenticated": True,
        "username": f"SP:{client_id}",
        "tenant_id": tenant_id,
        "expires_on": token.expires_on,
        "available_scopes": available,
    }


def get_credential(profile_id: int) -> Optional[TokenCredential]:
    """Return the stored credential for a profile, or None."""
    auth = _store.get(profile_id)
    return auth.credential if auth else None


def get_token_for_scope(profile_id: int, scope: str) -> Optional[str]:
    """Acquire a token for a specific scope using the stored credential.

    Returns the token string, or None if the profile is not authenticated
    or the scope is not available.
    """
    auth = _store.get(profile_id)
    if not auth:
        return None
    try:
        access = auth.credential.get_token(scope)
        return access.token
    except Exception as exc:
        logger.warning("Token acquisition for scope %s failed (profile %d): %s", scope, profile_id, exc)
        return None


def get_auth_info(profile_id: int) -> Optional[ProfileAuth]:
    """Return full auth info for a profile."""
    return _store.get(profile_id)


def is_authenticated(profile_id: int) -> bool:
    return profile_id in _store


def remove_credential(profile_id: int) -> None:
    _store.pop(profile_id, None)
    logger.info("Cleared credentials for profile %d", profile_id)


def list_authenticated_profiles() -> list[int]:
    return list(_store.keys())


# ── Device-code (interactive) flow ───────────────────────────────────


def start_device_code_flow(profile_id: int, tenant_id: str) -> dict:
    """Initiate an Azure AD device-code flow for interactive login.

    Tries multiple well-known Microsoft public client IDs in sequence
    because some tenants restrict which applications are allowed.

    Returns a dict with ``user_code``, ``verification_uri``, and a
    human-readable ``message`` that the frontend should display.
    A background thread starts polling Azure AD for completion.
    """
    import msal

    # Cancel any existing pending flow for this profile
    cancel_device_code_flow(profile_id)

    authority = f"https://login.microsoftonline.com/{tenant_id}"
    last_error = None

    from app.config import settings
    if not settings.azure_client_id.strip():
        raise RuntimeError("Configure AZAUDIT_AZURE_CLIENT_ID with your own public client app registration")
    for client_id in [settings.azure_client_id.strip()]:
        try:
            app = msal.PublicClientApplication(
                client_id,
                authority=authority,
            )
            flow = app.initiate_device_flow(scopes=[SCOPE_ARM])
            if "user_code" in flow:
                break  # success
            last_error = flow.get("error_description", "Unknown error")
            logger.debug(
                "Client %s rejected by tenant %s: %s",
                client_id, tenant_id, last_error,
            )
        except Exception as exc:
            last_error = str(exc)
            logger.debug(
                "Client %s failed for tenant %s: %s",
                client_id, tenant_id, exc,
            )
    else:
        raise RuntimeError(
            f"Device-code flow failed — none of the well-known Microsoft "
            f"app IDs are permitted in this tenant. Last error: {last_error}. "
            f"The tenant admin may need to allow a first-party Microsoft app "
            f"or register a custom app."
        )

    # Submit the blocking acquire call to a thread pool
    future = _executor.submit(app.acquire_token_by_device_flow, flow)

    _pending_flows[profile_id] = {
        "app": app,
        "flow": flow,
        "future": future,
        "tenant_id": tenant_id,
    }

    logger.info("Device-code flow started for profile %d", profile_id)
    return {
        "user_code": flow["user_code"],
        "verification_uri": flow["verification_uri"],
        "message": flow["message"],
    }


def poll_device_code_flow(profile_id: int) -> dict:
    """Check whether a pending device-code flow has completed.

    Returns a dict with ``status``:
    - ``"pending"`` – still waiting for user to complete sign-in
    - ``"complete"`` – authentication succeeded; credential stored
    - ``"error"`` – authentication failed
    - ``"not_started"`` – no pending flow for this profile
    """
    pending = _pending_flows.get(profile_id)
    if not pending:
        return {"status": "not_started"}

    future: concurrent.futures.Future = pending["future"]
    if not future.done():
        return {"status": "pending"}

    # Retrieve the result
    try:
        result = future.result()
    except Exception as exc:
        _pending_flows.pop(profile_id, None)
        logger.exception("Device-code polling failed for profile %d", profile_id)
        return {"status": "error", "error": INTERACTIVE_AUTH_FAILURE_MESSAGE}

    if "access_token" not in result:
        _pending_flows.pop(profile_id, None)
        logger.warning(
            "Device-code authentication rejected for profile %d: %s",
            profile_id,
            result.get("error_description") or result.get("error") or "unknown device-code error",
        )
        return {
            "status": "error",
            "error": INTERACTIVE_AUTH_FAILURE_MESSAGE,
        }

    # ── Success — build credential and probe scopes ──────────────
    app = pending["app"]
    accounts = app.get_accounts()
    if not accounts:
        _pending_flows.pop(profile_id, None)
        logger.warning("Device-code authentication completed without accounts for profile %d", profile_id)
        return {"status": "error", "error": INTERACTIVE_AUTH_FAILURE_MESSAGE}

    account = accounts[0]
    username = account.get("username", "unknown")
    tenant_id = pending["tenant_id"]

    from app.services.azure_auth import MsalTokenCredential

    credential = MsalTokenCredential(app, account)

    # Probe which scopes are available (ARM is guaranteed)
    available: list[str] = []
    for scope in [SCOPE_ARM, SCOPE_GRAPH, SCOPE_BAP, SCOPE_DATAVERSE, SCOPE_BC]:
        try:
            credential.get_token(scope)
            available.append(scope)
        except Exception:
            logger.debug(
                "Scope %s unavailable for interactive profile %d", scope, profile_id,
            )

    _store[profile_id] = ProfileAuth(
        credential=credential,
        tenant_id=tenant_id,
        username=username,
        auth_type="interactive",
        available_scopes=available,
    )

    _pending_flows.pop(profile_id, None)

    logger.info(
        "Profile %d authenticated interactively as %s against tenant %s (scopes: %s)",
        profile_id, username, tenant_id, ", ".join(available),
    )
    return {
        "status": "complete",
        "authenticated": True,
        "username": username,
        "tenant_id": tenant_id,
        "available_scopes": available,
    }


def cancel_device_code_flow(profile_id: int) -> bool:
    """Cancel a pending device-code flow if one exists."""
    pending = _pending_flows.pop(profile_id, None)
    if pending:
        future: concurrent.futures.Future = pending["future"]
        future.cancel()
        logger.info("Cancelled pending device-code flow for profile %d", profile_id)
        return True
    return False
