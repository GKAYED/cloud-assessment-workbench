"""Inventory router — Resource Graph queries.

Endpoints:
  GET /api/inventory/subscriptions
  GET /api/inventory/resources
  GET /api/inventory/resource-groups
  GET /api/inventory/summary
  GET /api/inventory/tree
  GET /api/inventory/databases
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_credential, get_gap_collector
from app.services.azure_auth import StaticTokenCredential
from app.services.data_gap_collector import DataGapCollector

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("/subscriptions")
async def list_subscriptions(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.inventory_service import get_subscriptions
    result = await get_subscriptions(credential, gaps)
    return result.get("subscriptions", result) if isinstance(result, dict) else result


@router.get("/resources")
async def list_resources(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.inventory_service import get_resources
    result = await get_resources(credential, gaps)
    return result.get("resources", result) if isinstance(result, dict) else result


@router.get("/resource-groups")
async def list_resource_groups(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.inventory_service import get_resource_groups
    result = await get_resource_groups(credential, gaps)
    return result.get("resource_groups", result) if isinstance(result, dict) else result


@router.get("/summary")
async def get_summary(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.inventory_service import get_inventory_summary
    return await get_inventory_summary(credential, gaps)


@router.get("/tree")
async def get_tree(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.inventory_service import get_tree as get_inventory_tree
    result = await get_inventory_tree(credential, gaps)
    return result.get("tree", result) if isinstance(result, dict) else result


@router.get("/databases")
async def list_databases(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.inventory_service import get_databases
    result = await get_databases(credential, gaps)
    return result.get("databases", result) if isinstance(result, dict) else result
