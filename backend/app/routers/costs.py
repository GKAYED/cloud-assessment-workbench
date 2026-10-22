"""Cost router — Cost Management queries.

Endpoints:
  GET /api/costs/by-resource
  GET /api/costs/by-resource-group
  GET /api/costs/by-subscription
  GET /api/costs/by-resource-type
  GET /api/costs/summary
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_credential, get_gap_collector
from app.services.azure_auth import StaticTokenCredential
from app.services.data_gap_collector import DataGapCollector

router = APIRouter(prefix="/api/costs", tags=["costs"])
logger = logging.getLogger(__name__)

# Cost endpoints can be expensive on large tenants (many subscriptions and
# 6-month windows). Allow longer server-side runtime during pull-data flows.
DETAIL_TIMEOUT_SEC = 420
SUMMARY_TIMEOUT_SEC = 300


@router.get("/by-resource")
async def costs_by_resource(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.cost_service import get_costs_by_resource
    try:
        result = await asyncio.wait_for(
            get_costs_by_resource(credential, gaps),
            timeout=DETAIL_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        logger.warning("Cost by-resource endpoint timed out after %ss", DETAIL_TIMEOUT_SEC)
        gaps.add_gap(
            module="Costs",
            field="by_resource",
            reason=f"Endpoint timed out after {DETAIL_TIMEOUT_SEC}s",
            severity="medium",
            remediation="Retry Pull Data. Cost API returned too slowly.",
        )
        raise HTTPException(
            status_code=504,
            detail=f"Cost by-resource timed out after {DETAIL_TIMEOUT_SEC}s. Retry Pull Data.",
        )
    return result.get("costs", result) if isinstance(result, dict) else result


@router.get("/by-resource-group")
async def costs_by_resource_group(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.cost_service import get_costs_by_group
    try:
        result = await asyncio.wait_for(
            get_costs_by_group(credential, gaps, "resource_group"),
            timeout=DETAIL_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        logger.warning("Cost by-resource-group endpoint timed out after %ss", DETAIL_TIMEOUT_SEC)
        gaps.add_gap(
            module="Costs",
            field="by_resource_group",
            reason=f"Endpoint timed out after {DETAIL_TIMEOUT_SEC}s",
            severity="medium",
            remediation="Retry Pull Data. Cost API returned too slowly.",
        )
        raise HTTPException(
            status_code=504,
            detail=f"Cost by-resource-group timed out after {DETAIL_TIMEOUT_SEC}s. Retry Pull Data.",
        )
    return result.get("rollups", result) if isinstance(result, dict) else result


@router.get("/by-subscription")
async def costs_by_subscription(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.cost_service import get_costs_by_group
    try:
        result = await asyncio.wait_for(
            get_costs_by_group(credential, gaps, "subscription"),
            timeout=DETAIL_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        logger.warning("Cost by-subscription endpoint timed out after %ss", DETAIL_TIMEOUT_SEC)
        gaps.add_gap(
            module="Costs",
            field="by_subscription",
            reason=f"Endpoint timed out after {DETAIL_TIMEOUT_SEC}s",
            severity="medium",
            remediation="Retry Pull Data. Cost API returned too slowly.",
        )
        raise HTTPException(
            status_code=504,
            detail=f"Cost by-subscription timed out after {DETAIL_TIMEOUT_SEC}s. Retry Pull Data.",
        )
    return result.get("rollups", result) if isinstance(result, dict) else result


@router.get("/by-resource-type")
async def costs_by_resource_type(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.cost_service import get_costs_by_group
    try:
        result = await asyncio.wait_for(
            get_costs_by_group(credential, gaps, "resource_type"),
            timeout=DETAIL_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        logger.warning("Cost by-resource-type endpoint timed out after %ss", DETAIL_TIMEOUT_SEC)
        gaps.add_gap(
            module="Costs",
            field="by_resource_type",
            reason=f"Endpoint timed out after {DETAIL_TIMEOUT_SEC}s",
            severity="medium",
            remediation="Retry Pull Data. Cost API returned too slowly.",
        )
        raise HTTPException(
            status_code=504,
            detail=f"Cost by-resource-type timed out after {DETAIL_TIMEOUT_SEC}s. Retry Pull Data.",
        )
    return result.get("rollups", result) if isinstance(result, dict) else result


@router.get("/summary")
async def cost_summary(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.cost_service import get_cost_summary
    try:
        result = await asyncio.wait_for(
            get_cost_summary(credential, gaps),
            timeout=SUMMARY_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        logger.warning("Cost summary endpoint timed out after %ss", SUMMARY_TIMEOUT_SEC)
        gaps.add_gap(
            module="Costs",
            field="summary",
            reason=f"Endpoint timed out after {SUMMARY_TIMEOUT_SEC}s",
            severity="medium",
            remediation="Retry Pull Data. Cost API returned too slowly.",
        )
        raise HTTPException(
            status_code=504,
            detail=f"Cost summary timed out after {SUMMARY_TIMEOUT_SEC}s. Retry Pull Data.",
        )
    # Add alias fields expected by frontend
    if isinstance(result, dict):
        result.setdefault("total", result.get("total_cost_1m", 0))
        result.setdefault("trend_direction", result.get("overall_trend", "stable"))
    return result
