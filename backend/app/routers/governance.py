"""Governance router — Policy compliance, RBAC role assignments, orphaned resources.

Endpoints:
  GET /api/governance/policy-compliance
  GET /api/governance/role-assignments
  GET /api/governance/orphaned-resources
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_credential, get_gap_collector
from app.services.azure_auth import StaticTokenCredential
from app.services.data_gap_collector import DataGapCollector

router = APIRouter(prefix="/api/governance", tags=["governance"])


@router.get("/policy-compliance")
async def policy_compliance(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.governance_service import get_policy_compliance
    return await get_policy_compliance(credential, gaps)


@router.get("/role-assignments")
async def role_assignments(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.governance_service import get_role_assignments
    return await get_role_assignments(credential, gaps)


@router.get("/orphaned-resources")
async def orphaned_resources(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.governance_service import get_orphaned_resources
    return await get_orphaned_resources(credential, gaps)
