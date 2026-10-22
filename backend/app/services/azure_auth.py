"""Azure authentication helpers.

StaticTokenCredential wraps a pre-acquired Bearer token so that
Azure SDK management clients can use it without DefaultAzureCredential.

MsalTokenCredential wraps an MSAL PublicClientApplication so that
tokens acquired via device-code (interactive) flow are automatically
refreshed using MSAL's built-in token cache / refresh tokens.

Well-known token scopes for the various Microsoft APIs used by AzAudit.
"""

from __future__ import annotations

import asyncio
import logging
import time

from azure.core.credentials import AccessToken, TokenCredential

logger = logging.getLogger(__name__)

# Prevent token refresh from stalling request handlers indefinitely.
TOKEN_ACQUIRE_TIMEOUT_SEC = 12

# ── Well-known scopes ────────────────────────────────────────────────
SCOPE_ARM = "https://management.azure.com/.default"
SCOPE_GRAPH = "https://graph.microsoft.com/.default"
SCOPE_BAP = "https://api.bap.microsoft.com/.default"
SCOPE_DATAVERSE = "https://globaldisco.crm.dynamics.com/.default"  # discovery
SCOPE_BC = "https://api.businesscentral.dynamics.com/.default"

# Well-known Microsoft first-party public client IDs.
# Used for device-code and ROPC flows so no custom app registration is needed.
# Some tenants restrict which apps are allowed — we try them in order.
AZURE_CLI_CLIENT_ID = "04b07795-a710-4e55-adb5-31e0c8b44b82"

PUBLIC_CLIENT_IDS = [
    AZURE_CLI_CLIENT_ID,                          # Azure CLI
    "1950a258-227b-4e31-a9cf-717495945fc2",       # Azure PowerShell
    "d3590ed6-52b3-4102-aeff-aad2292ab01c",       # Microsoft Office
    "00b41c95-dab0-4487-9791-b9d2c32c80f2",       # Office 365 Management
]


class StaticTokenCredential(TokenCredential):
    """Wraps a pre-acquired access token for use with Azure SDK clients.

    When created with a raw token string the expiry is unknown (set to 0).
    """

    def __init__(self, token: str) -> None:
        self._token = token

    def get_token(self, *scopes: str, **kwargs) -> AccessToken:
        return AccessToken(self._token, 0)


class MsalTokenCredential(TokenCredential):
    """Wraps an MSAL PublicClientApplication for automatic token management.

    After interactive authentication (device-code flow) this credential
    uses MSAL's in-memory token cache and refresh tokens to silently
    acquire tokens for any scope/resource the app has permissions for.
    Token refresh is handled transparently by MSAL.

    Local cache layer: tokens are cached in-memory and reused until they
    are within 5 minutes of expiry.  This avoids calling MSAL's
    ``acquire_token_silent`` on every single request (which can trigger
    a synchronous HTTP roundtrip for token refresh and block the event
    loop when multiple requests pile up).
    """

    _REFRESH_BUFFER = 300  # refresh 5 min before expiry

    def __init__(self, app, account: dict) -> None:
        self._app = app
        self._account = account
        self._cache: dict[str, AccessToken] = {}  # scope_key → AccessToken

    def get_token(self, *scopes: str, **kwargs) -> AccessToken:
        scope_key = ",".join(sorted(scopes))

        # Return cached token if still valid
        cached = self._cache.get(scope_key)
        if cached and cached.expires_on - time.time() > self._REFRESH_BUFFER:
            return cached

        # Call MSAL (may do a synchronous network call for token refresh)
        logger.info("MSAL acquire_token_silent for scopes=%s", scopes)
        result = self._app.acquire_token_silent(list(scopes), account=self._account)
        if result and "access_token" in result:
            expires_on = int(time.time()) + result.get("expires_in", 3600)
            token = AccessToken(result["access_token"], expires_on)
            self._cache[scope_key] = token
            logger.info("Token acquired for %s, expires in %ds", scope_key, result.get("expires_in", 3600))
            return token
        raise ValueError(
            f"Token acquisition failed for scopes {scopes}. "
            "The session may have expired — please re-authenticate."
        )


def extract_bearer_token(credential: TokenCredential, scope: str = SCOPE_ARM) -> str:
    """Safely extract a bearer token string from any TokenCredential.

    Uses the public ``get_token`` API so that SDK-managed credentials
    (UsernamePasswordCredential, ClientSecretCredential) refresh
    automatically when expired, instead of accessing the private
    ``_token`` attribute directly.
    """
    access = credential.get_token(scope)
    return access.token


async def extract_bearer_token_async(
    credential: TokenCredential,
    scope: str = SCOPE_ARM,
    timeout_sec: float = TOKEN_ACQUIRE_TIMEOUT_SEC,
) -> str:
    """Async wrapper — runs ``get_token`` in a thread so MSAL's synchronous
    HTTP calls (e.g. refresh-token exchange) never block the event loop."""
    try:
        access = await asyncio.wait_for(
            asyncio.to_thread(credential.get_token, scope),
            timeout=timeout_sec,
        )
        return access.token
    except asyncio.TimeoutError as exc:
        logger.warning(
            "Timed out acquiring token for scope=%s after %.1fs",
            scope,
            timeout_sec,
        )
        raise TimeoutError(
            f"Timed out acquiring Azure token for scope '{scope}' "
            f"after {timeout_sec:.0f} seconds"
        ) from exc
