"""Dynamics 365 router — D365 CRM, BC, Power Platform.

Tokens are now acquired from the credential store using the appropriate
scope for each API (BAP, Dataverse, BC).  No custom headers needed
from the frontend.

Endpoints:
  GET /api/dynamics/environments
  GET /api/dynamics/users
  GET /api/dynamics/module-stats
  GET /api/dynamics/workflow-health
  GET /api/dynamics/bc-stats
"""

from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends

from app.dependencies import get_gap_collector, get_profile_id
from app.services.azure_auth import SCOPE_BAP, SCOPE_DATAVERSE, SCOPE_BC
from app.services.data_gap_collector import DataGapCollector

router = APIRouter(prefix="/api/dynamics", tags=["dynamics"])


def _resolve_token(profile_id: Optional[int], scope: str) -> str:
    """Get a scoped token from the credential store."""
    if profile_id is None:
        return ""
    from app.services.credential_store import get_token_for_scope
    return get_token_for_scope(profile_id, scope) or ""


def _resolve_dataverse_org_token(profile_id: Optional[int], instance_url: str) -> str:
    """Get a Dataverse token scoped to a specific org URL (sync — call via to_thread)."""
    if profile_id is None or not instance_url:
        return ""
    from app.services.credential_store import get_token_for_scope
    base = instance_url.rstrip("/")
    for scope in (f"{base}/.default", f"{base}/user_impersonation"):
        token = get_token_for_scope(profile_id, scope)
        if token:
            return token
    return ""


# Per-request cache for org-scoped tokens so we don't repeat MSAL calls.
_org_token_cache: dict[str, str] = {}


def _make_async_resolver(profile_id: Optional[int]):
    """Return an async callable that resolves org-scoped Dataverse tokens.

    Wraps the sync MSAL call in ``asyncio.to_thread`` to avoid blocking
    the event loop, and caches results per instance URL.
    """
    async def resolver(instance_url: str) -> str:
        if not instance_url:
            return ""
        cache_key = f"{profile_id}:{instance_url.rstrip('/')}"
        cached = _org_token_cache.get(cache_key)
        if cached is not None:
            return cached
        token = await asyncio.to_thread(
            _resolve_dataverse_org_token, profile_id, instance_url,
        )
        _org_token_cache[cache_key] = token or ""
        return token or ""
    return resolver


@router.get("/environments")
async def list_environments(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.dynamics_service import get_environments
    bap_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_BAP)
    dv_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_DATAVERSE)
    result = await get_environments(bap_token, gaps, dataverse_token=dv_token)
    if isinstance(result, dict):
        envs = result.get("environments", [])
        for e in envs:
            e.setdefault("url", e.get("instance_url", ""))
            # Normalise state — Global Discovery returns 0 for active
            raw_state = e.get("state")
            if raw_state == 0 or str(raw_state).lower() in ("0", "enabled", "active", ""):
                e["status"] = "Enabled"
            else:
                e["status"] = str(raw_state)
            e.setdefault("environment_type", e.get("type") or "Production")
        return envs
    return result


@router.get("/users")
async def list_users(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.dynamics_service import get_users
    bap_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_BAP)
    dv_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_DATAVERSE)
    # Dataverse APIs require a Dataverse-scoped token; BAP is only a fallback
    # for environment discovery when Dataverse scope is unavailable.
    result = await get_users(
        dv_token or bap_token,
        gaps,
        dataverse_token=dv_token,
        dataverse_token_resolver=_make_async_resolver(profile_id),
    )
    if isinstance(result, dict):
        users = result.get("users", [])
        for u in users:
            u.setdefault("display_name", u.get("full_name", ""))
            u.setdefault("roles", [])
            u.setdefault("security_roles", [])
        return users
    return result


@router.get("/module-stats")
async def module_stats(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.dynamics_service import get_module_stats
    bap_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_BAP)
    dv_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_DATAVERSE)
    # Dataverse token is required for solution/module queries.
    result = await get_module_stats(
        dv_token or bap_token,
        gaps,
        dataverse_token=dv_token,
        dataverse_token_resolver=_make_async_resolver(profile_id),
    )
    if isinstance(result, dict):
        modules = result.get("modules", [])
        # Map solution data to module-like shape
        for m in modules:
            m.setdefault("entity_name", m.get("name", ""))
            m.setdefault("module", m.get("unique_name", ""))
            m.setdefault("record_count", None)  # solutions don't have record counts
            m.setdefault("environment_id", m.get("environment", ""))
        return modules
    return result


@router.get("/workflow-health")
async def workflow_health(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.dynamics_service import get_workflow_health
    bap_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_BAP)
    dv_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_DATAVERSE)
    # Workflow entities are in Dataverse; prefer Dataverse scope.
    result = await get_workflow_health(
        dv_token or bap_token,
        gaps,
        dataverse_token=dv_token,
        dataverse_token_resolver=_make_async_resolver(profile_id),
    )
    if isinstance(result, dict):
        workflows = result.get("workflows", [])
        for w in workflows:
            w.setdefault("workflow_name", w.get("name", ""))
            w.setdefault("environment_id", w.get("environment", ""))
            w.setdefault("status", "Running" if w.get("state") == "active" else "Stopped")
            w.setdefault("success_rate", None)
            w.setdefault("total_runs", None)
        return workflows
    return result


@router.get("/bc-stats")
async def bc_stats(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.dynamics_service import get_bc_stats
    bc_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_BC)
    dv_token = await asyncio.to_thread(_resolve_token, profile_id, SCOPE_DATAVERSE)
    result = await get_bc_stats(bc_token, gaps, dataverse_token=dv_token)
    if isinstance(result, dict):
        companies = result.get("companies", [])
        for c in companies:
            c.setdefault("company_name", c.get("display_name", c.get("name", "")))
            c.setdefault("environment_id", c.get("environment", ""))
            c.setdefault("customers_count", None)
            c.setdefault("vendors_count", None)
            c.setdefault("items_count", None)
            c.setdefault("gl_entries_count", None)
        return companies
    return result
