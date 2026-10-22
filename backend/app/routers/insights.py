"""Insights router — executive insight generation.

Endpoints:
  GET /api/insights
  GET /api/insights/recommendations
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable
from typing import Any

from fastapi import APIRouter, Depends

from app.dependencies import get_credential, get_gap_collector, get_profile_id
from app.services.azure_auth import StaticTokenCredential, extract_bearer_token_async
from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["insights"])

_CORE_MODULE_TIMEOUT_SEC = 40
_OPTIONAL_MODULE_TIMEOUT_SEC = 20


async def _run_with_timeout(
    *,
    task_name: str,
    module: str,
    field: str,
    coro: Awaitable[Any],
    gaps: DataGapCollector,
    timeout_sec: int,
) -> Any | None:
    try:
        return await asyncio.wait_for(coro, timeout=timeout_sec)
    except asyncio.TimeoutError:
        logger.warning("%s timed out after %ss", task_name, timeout_sec)
        gaps.add_gap(
            module=module,
            field=field,
            reason=f"{task_name} timed out after {timeout_sec}s",
            severity="medium",
            remediation="Azure APIs were slow. Re-run Pull Data to complete this module.",
        )
        return None
    except Exception as exc:
        logger.warning("%s failed: %s", task_name, exc)
        gaps.add_gap(
            module=module,
            field=field,
            reason=format_gap_reason(exc),
            severity="medium",
            remediation="Check permissions/connectivity, then re-run Pull Data.",
        )
        return None


async def _collect_module_data(credential: StaticTokenCredential, gaps: DataGapCollector, profile_id: int | None = None) -> dict:
    """Gather summary data from all modules for insight generation."""
    module_data: dict = {}

    # Import services lazily to avoid circular imports
    from app.services.cost_service import get_cost_summary
    from app.services.advisor_service import get_advisor_recommendations
    from app.services.security_service import get_defender_scores
    from app.services.inventory_service import get_inventory_summary
    from app.services.integration_service import get_integrations, get_integration_recommendations

    # Acquire ARM token once and reuse it across sub-collectors to avoid
    # multiple concurrent token refreshes on profile-backed credentials.
    shared_credential: StaticTokenCredential = credential
    token = await _run_with_timeout(
        task_name="ARM token acquisition",
        module="Authentication",
        field="arm_token",
        coro=extract_bearer_token_async(credential),
        gaps=gaps,
        timeout_sec=_OPTIONAL_MODULE_TIMEOUT_SEC,
    )
    if isinstance(token, str) and token:
        shared_credential = StaticTokenCredential(token)

    (
        cost_result,
        advisor_result,
        defender_result,
        inv_result,
        integ_result,
        integ_rec_result,
    ) = await asyncio.gather(
        _run_with_timeout(
            task_name="Cost summary collection",
            module="Costs",
            field="summary",
            coro=get_cost_summary(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="Advisor recommendations collection",
            module="Security",
            field="advisor_recommendations",
            coro=get_advisor_recommendations(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="Defender score collection",
            module="Security",
            field="defender_scores",
            coro=get_defender_scores(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="Inventory summary collection",
            module="Inventory",
            field="summary",
            coro=get_inventory_summary(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="Integration collection",
            module="Integrations",
            field="all",
            coro=get_integrations(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="Integration recommendation collection",
            module="Integrations",
            field="recommendations",
            coro=get_integration_recommendations(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
    )

    if isinstance(cost_result, dict):
        module_data["costs"] = cost_result
    if isinstance(advisor_result, dict):
        module_data["advisor"] = advisor_result
    if isinstance(defender_result, dict):
        module_data["security"] = defender_result
    if isinstance(inv_result, dict):
        module_data["inventory"] = inv_result
    if isinstance(integ_result, dict):
        module_data["integrations"] = integ_result
    if isinstance(integ_rec_result, dict):
        module_data["integration_recommendations"] = integ_rec_result

    # Collect license and dynamics data via scoped tokens
    if profile_id is not None:
        from app.services.azure_auth import SCOPE_GRAPH, SCOPE_BAP, SCOPE_DATAVERSE
        from app.services.credential_store import get_token_for_scope

        # Licenses (Graph)
        graph_token = get_token_for_scope(profile_id, SCOPE_GRAPH)
        if graph_token:
            from app.services.license_service import get_license_summary
            lic_result = await _run_with_timeout(
                task_name="License summary collection",
                module="Licenses",
                field="summary",
                coro=get_license_summary(graph_token, gaps),
                gaps=gaps,
                timeout_sec=_OPTIONAL_MODULE_TIMEOUT_SEC,
            )
            if isinstance(lic_result, dict):
                module_data["licenses"] = lic_result

        # Dynamics (Global Discovery preferred, BAP fallback)
        bap_token = get_token_for_scope(profile_id, SCOPE_BAP)
        dv_token = get_token_for_scope(profile_id, SCOPE_DATAVERSE)
        if bap_token or dv_token:
            from app.services.dynamics_service import get_environments, get_workflow_health
            env_result, wf_result = await asyncio.gather(
                _run_with_timeout(
                    task_name="Dynamics environments collection",
                    module="Dynamics",
                    field="environments",
                    coro=get_environments(bap_token or "", gaps, dataverse_token=dv_token),
                    gaps=gaps,
                    timeout_sec=_OPTIONAL_MODULE_TIMEOUT_SEC,
                ),
                _run_with_timeout(
                    task_name="Dynamics workflow collection",
                    module="Dynamics",
                    field="workflows",
                    coro=get_workflow_health(bap_token or "", gaps, dataverse_token=dv_token),
                    gaps=gaps,
                    timeout_sec=_OPTIONAL_MODULE_TIMEOUT_SEC,
                ),
            )
            if isinstance(env_result, dict):
                module_data["dynamics_environments"] = env_result
            if isinstance(wf_result, dict):
                module_data["dynamics_workflows"] = wf_result
            module_data["dynamics"] = {
                "environments": env_result if isinstance(env_result, dict) else {},
                "workflows": wf_result if isinstance(wf_result, dict) else {},
                "environment_count": (env_result or {}).get("total_count", 0) if isinstance(env_result, dict) else 0,
                "workflow_count": (wf_result or {}).get("total_count", 0) if isinstance(wf_result, dict) else 0,
                "active_workflows": (wf_result or {}).get("active_count", 0) if isinstance(wf_result, dict) else 0,
                "inactive_workflows": (wf_result or {}).get("inactive_count", 0) if isinstance(wf_result, dict) else 0,
            }

    module_data["data_gaps"] = gaps.get_gaps()
    return module_data


@router.get("")
async def get_insights(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
    profile_id: int | None = Depends(get_profile_id),
):
    """Return auto-generated executive insights from all modules."""
    from app.services.insight_engine import generate_insights
    module_data = await _collect_module_data(credential, gaps, profile_id)
    return generate_insights(module_data)


@router.get("/recommendations")
async def get_recommendations(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
    profile_id: int | None = Depends(get_profile_id),
):
    """Return aggregated recommendations across all modules."""
    from app.services.insight_engine import generate_recommendations
    module_data = await _collect_module_data(credential, gaps, profile_id)
    return generate_recommendations(module_data)
