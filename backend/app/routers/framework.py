"""Framework router — WAF / CAF alignment insights.

Endpoints:
  GET /api/framework-insights
"""

from __future__ import annotations

import asyncio
import logging
import json
from collections.abc import Awaitable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AppPortfolioEntryDB, CustomerProfileDB, FrameworkManualCafDB, InitiativeDB, get_db
from app.dependencies import get_credential, get_gap_collector, get_profile_id
from app.models.framework_manual_caf import FrameworkManualCafRecord, FrameworkManualCafUpdate
from app.services.azure_auth import StaticTokenCredential, extract_bearer_token_async
from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/framework-insights", tags=["framework"])

_CORE_MODULE_TIMEOUT_SEC = 90
_OPTIONAL_MODULE_TIMEOUT_SEC = 45


def _framework_manual_row_to_model(row: FrameworkManualCafDB) -> FrameworkManualCafRecord:
    ratings: dict[str, dict[str, str]] = {}
    if row.ratings_json:
        try:
            parsed = json.loads(row.ratings_json)
            if isinstance(parsed, dict):
                ratings = {
                    str(method_key): {
                        str(dim_key): str(value)
                        for dim_key, value in method_values.items()
                        if isinstance(method_values, dict)
                    }
                    for method_key, method_values in parsed.items()
                }
        except (TypeError, ValueError):
            ratings = {}

    return FrameworkManualCafRecord(
        id=row.id,
        profile_id=row.profile_id,
        ratings=ratings,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/profiles/{profile_id}/manual-caf", response_model=FrameworkManualCafRecord)
async def get_framework_manual_caf(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(FrameworkManualCafDB).where(FrameworkManualCafDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = FrameworkManualCafDB(profile_id=profile_id, ratings_json=json.dumps({}))
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _framework_manual_row_to_model(row)


@router.put("/profiles/{profile_id}/manual-caf", response_model=FrameworkManualCafRecord)
async def upsert_framework_manual_caf(
    profile_id: int,
    body: FrameworkManualCafUpdate,
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(FrameworkManualCafDB).where(FrameworkManualCafDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = FrameworkManualCafDB(profile_id=profile_id)
        db.add(row)

    row.ratings_json = json.dumps(body.ratings or {})

    await db.commit()
    await db.refresh(row)
    return _framework_manual_row_to_model(row)


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


async def _collect_module_data(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
    profile_id: int | None = None,
    db: AsyncSession | None = None,
) -> dict:
    """Gather summary data from all modules for framework assessment."""
    module_data: dict = {}

    from app.services.advisor_service import get_advisor_scores, get_advisor_recommendations
    from app.services.security_service import get_defender_scores
    from app.services.inventory_service import get_inventory_summary
    from app.services.integration_service import get_integrations
    from app.services.governance_service import get_policy_compliance, get_role_assignments, get_orphaned_resources

    # Acquire ARM token once to avoid repeated concurrent refresh attempts.
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
        advisor_scores_result,
        defender_result,
        inv_result,
        integ_result,
        advisor_recs_result,
        policy_result,
        rbac_result,
        orphan_result,
    ) = await asyncio.gather(
        _run_with_timeout(
            task_name="Advisor score collection",
            module="Security",
            field="advisor_scores",
            coro=get_advisor_scores(shared_credential, gaps),
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
            task_name="Advisor recommendations collection",
            module="Security",
            field="advisor_recommendations",
            coro=get_advisor_recommendations(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="Policy compliance collection",
            module="Governance",
            field="policy_compliance",
            coro=get_policy_compliance(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="RBAC role assignments collection",
            module="Governance",
            field="role_assignments",
            coro=get_role_assignments(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
        _run_with_timeout(
            task_name="Orphaned resources collection",
            module="Governance",
            field="orphaned_resources",
            coro=get_orphaned_resources(shared_credential, gaps),
            gaps=gaps,
            timeout_sec=_CORE_MODULE_TIMEOUT_SEC,
        ),
    )

    if isinstance(advisor_scores_result, dict):
        module_data["advisor_scores"] = advisor_scores_result
    if isinstance(defender_result, dict):
        module_data["security"] = defender_result
    if isinstance(inv_result, dict):
        module_data["inventory"] = inv_result
    if isinstance(integ_result, dict):
        module_data["integrations"] = integ_result
    if isinstance(advisor_recs_result, dict):
        module_data["advisor_recommendations"] = advisor_recs_result
    if isinstance(policy_result, dict):
        module_data["policy_compliance"] = policy_result
    if isinstance(rbac_result, dict):
        module_data["role_assignments"] = rbac_result
    if isinstance(orphan_result, dict):
        module_data["orphaned_resources"] = orphan_result

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
    module_data.setdefault("portfolio", [])
    module_data.setdefault("initiatives", [])

    if profile_id is not None and db is not None:
        portfolio_rows = (
            await db.execute(select(AppPortfolioEntryDB).where(AppPortfolioEntryDB.profile_id == profile_id))
        ).scalars().all()
        module_data["portfolio"] = [
            {
                "id": row.id,
                "app_name": row.app_name,
                "purpose": row.purpose,
                "business_owner": row.business_owner,
                "technical_owner": row.technical_owner,
                "current_hosting": row.current_hosting,
                "status": row.status,
                "criticality": row.criticality,
                "business_value": row.business_value,
                "technical_fitness": row.technical_fitness,
                "complexity": row.complexity,
                "strategic_fit": row.strategic_fit,
                "time_classification": row.time_classification,
                "future_state": row.future_state,
                "known_risks": row.known_risks,
            }
            for row in portfolio_rows
        ]

        initiative_rows = (
            await db.execute(select(InitiativeDB).where(InitiativeDB.profile_id == profile_id))
        ).scalars().all()
        module_data["initiatives"] = [
            {
                "id": row.id,
                "name": row.name,
                "description": row.description,
                "status": row.status,
                "priority": row.priority,
                "complexity": row.complexity,
                "strategic_fit": row.strategic_fit,
                "target_quarter": row.target_quarter,
                "category": row.category,
                "business_owner": row.business_owner,
                "technical_owner": row.technical_owner,
                "validation_status": row.validation_status,
                "evidence_confidence": row.evidence_confidence,
            }
            for row in initiative_rows
        ]

    return module_data


@router.get("")
async def get_framework_insights(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
    profile_id: int | None = Depends(get_profile_id),
    db: AsyncSession = Depends(get_db),
):
    """Return WAF/CAF framework alignment assessment."""

    from app.services.waf_caf_engine import generate_framework_assessment
    module_data = await _collect_module_data(credential, gaps, profile_id, db)
    return generate_framework_assessment(module_data)
