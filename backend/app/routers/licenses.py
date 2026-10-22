"""Licenses router — Microsoft Graph license queries.

Tokens are now acquired from the credential store using the Graph scope.
No custom X-Graph-Token header needed from the frontend.

Endpoints:
  GET /api/licenses/skus
  GET /api/licenses/users
  GET /api/licenses/summary
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends

from app.dependencies import get_gap_collector, get_profile_id
from app.services.azure_auth import SCOPE_GRAPH
from app.services.data_gap_collector import DataGapCollector

router = APIRouter(prefix="/api/licenses", tags=["licenses"])


def _resolve_graph_token(profile_id: Optional[int]) -> str:
    """Get a Graph-scoped token from the credential store."""
    if profile_id is None:
        return ""
    from app.services.credential_store import get_token_for_scope
    return get_token_for_scope(profile_id, SCOPE_GRAPH) or ""


@router.get("/skus")
async def list_skus(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.license_service import get_license_skus
    token = _resolve_graph_token(profile_id)
    result = await get_license_skus(token, gaps)
    if isinstance(result, dict):
        skus = result.get("skus", [])
        # Add alias fields matching demo shape
        for s in skus:
            total = s.get("total_licenses", 0)
            s.setdefault("sku_name", s.get("sku_part_number", ""))
            s.setdefault("sku_display_name", s.get("friendly_name", ""))
            s.setdefault("total", total)
            s.setdefault("purchased", total)
            s.setdefault("assigned", s.get("assigned_licenses", 0))
            s.setdefault("consumed", s.get("consumed_units", 0))
            s.setdefault("available", s.get("available_licenses", 0))
            total = s.get("total_licenses", 0) or 1
            s.setdefault("utilization_percent", round(s.get("assigned_licenses", 0) / total * 100, 1))
            s.setdefault("utilization_pct", s.get("utilization_percent", 0))
            s.setdefault("is_underutilized", s.get("available_licenses", 0) > 0)
        return skus
    return result


@router.get("/users")
async def list_licensed_users(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from datetime import datetime, timedelta, timezone

    from app.services.license_service import get_licensed_users, SKU_NAMES
    token = _resolve_graph_token(profile_id)
    result = await get_licensed_users(token, gaps)
    if isinstance(result, dict):
        users = result.get("users", [])
        has_sign_in_data = bool(result.get("has_sign_in_data", False))
        cutoff_30d = datetime.now(timezone.utc) - timedelta(days=30)
        # Add alias fields matching demo shape
        for u in users:
            u.setdefault("display_name", u.get("display_name", ""))
            u.setdefault("user_principal_name", u.get("upn", ""))
            # Resolve SKU IDs to friendly names
            sku_ids = u.get("assigned_sku_ids", [])
            u.setdefault("assigned_licenses", [SKU_NAMES.get(sid, sid) for sid in sku_ids])
            u.setdefault("last_sign_in", u.get("last_sign_in"))
            if has_sign_in_data:
                last_sign_in = u.get("last_sign_in")
                inactive_30d: bool | None
                if isinstance(last_sign_in, str) and last_sign_in:
                    try:
                        dt = datetime.fromisoformat(last_sign_in.replace("Z", "+00:00"))
                        inactive_30d = dt < cutoff_30d
                    except Exception:
                        inactive_30d = None
                else:
                    inactive_30d = True
                u["is_inactive_30d"] = inactive_30d
            else:
                # AuditLog.Read.All not granted: inactivity cannot be determined.
                u["is_inactive_30d"] = None
        return users
    return result


@router.get("/summary")
async def license_summary(
    profile_id: Optional[int] = Depends(get_profile_id),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.license_service import get_license_summary
    token = _resolve_graph_token(profile_id)
    result = await get_license_summary(token, gaps)
    if isinstance(result, dict):
        # Add alias fields matching demo shape
        result.setdefault("total_skus", result.get("total_sku_count", 0))
        result.setdefault("total_licenses", result.get("total_licensed_seats", 0))
        result.setdefault("total_purchased", result.get("total_licensed_seats", 0))
        result.setdefault("assigned_licenses", result.get("total_assigned_seats", 0))
        result.setdefault("total_consumed", result.get("total_assigned_seats", 0))
        result.setdefault("unused_licenses", result.get("total_available_seats", 0))
        result.setdefault("total_available", result.get("total_available_seats", 0))
        result.setdefault("overall_utilization_pct", result.get("utilisation_percent", 0))
        result.setdefault("inactive_licensed_users", result.get("inactive_users_90d", 0))
        result.setdefault("underutilized_skus", [
            s.get("sku", "") for s in result.get("over_provisioned_skus", [])
        ])
        # Cost estimates — computed from SKU pricing table in the service
        result.setdefault("estimated_monthly_cost", result.get("estimated_monthly_cost"))
        result.setdefault("estimated_waste_monthly", result.get("estimated_waste_monthly"))
        result.setdefault("unassigned_seat_waste", result.get("unassigned_seat_waste"))
        result.setdefault("inactive_user_waste", result.get("inactive_user_waste"))
        result.setdefault("priced_sku_count", result.get("priced_sku_count", 0))
        result.setdefault("pricing_note", result.get("pricing_note", ""))
    return result
