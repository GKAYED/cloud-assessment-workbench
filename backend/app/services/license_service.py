"""License service — Microsoft Graph license queries.

Uses the Microsoft Graph API to retrieve:
  - subscribedSkus (tenant-level license SKUs)
  - users with licenseAssignmentStates (licensed users)
  - signInActivity (last sign-in, requires AuditLog.Read.All)

Token must be a Graph API token with Directory.Read.All
(and optionally AuditLog.Read.All for sign-in data).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

GRAPH_URL = "https://graph.microsoft.com/v1.0"
GRAPH_BETA = "https://graph.microsoft.com/beta"

# Well-known SKU-to-friendly-name mapping (most common)
SKU_NAMES: dict[str, str] = {
    "6fd2c87f-b296-42f0-b197-1e91e994b900": "Microsoft 365 E3",
    "c7df2760-2c81-4ef7-b578-5b5392b571df": "Microsoft 365 E5",
    "05e9a617-0261-4cee-bb44-138d3ef5d965": "Microsoft 365 E3 (no Teams)",
    "06ebc4ee-1bb5-47dd-8120-11324bc54e06": "Microsoft 365 E5 (no Teams)",
    "f245ecc8-75af-4f8e-b61f-27d8114de5f3": "Microsoft 365 F1",
    "66b55226-6b4f-492c-910c-a3b7a3c9d993": "Microsoft 365 F3",
    "726a0894-c82e-4f66-bc0f-a6c05c229006": "Dynamics 365 Customer Engagement Plan",
    "ea126fc5-a19e-42e2-a731-da9d437bffcf": "Dynamics 365 Plan",
    "8e7a3d30-d97d-43ab-837c-d7701cef83dc": "Dynamics 365 Team Members",
    "338148b6-1b2e-4736-8805-6fc3a5a8ebe1": "Dynamics 365 Business Central Essential",
    "2880026b-2b0c-4251-8656-5d41ff11e3aa": "Dynamics 365 Business Central Premium",
    "1f2f344a-700d-42c9-9427-5cea1d5d7ba6": "Power BI Pro",
    "f8a1db68-be16-40ed-86d5-cb42ce701560": "Power BI Premium Per User",
    "a403ebcc-fae0-4ca2-8c8c-7a907fd6c235": "Power Automate per User",
    "dcb1a3ae-b7d7-4571-b55e-07c3d6213d0e": "Power Apps per User",
}

# ---------------------------------------------------------------------------
# Estimated retail per-user/month prices (USD) for common M365 / D365 SKUs.
# Keyed by SKU ID and also by skuPartNumber (case-insensitive) as fallback.
# These are Microsoft list prices — actual EA/CSP pricing will differ, but
# this gives a reasonable order-of-magnitude waste estimate.
# ---------------------------------------------------------------------------

_SKU_PRICE_BY_ID: dict[str, float] = {
    # Microsoft 365
    "6fd2c87f-b296-42f0-b197-1e91e994b900": 36.00,   # M365 E3
    "c7df2760-2c81-4ef7-b578-5b5392b571df": 57.00,   # M365 E5
    "05e9a617-0261-4cee-bb44-138d3ef5d965": 33.75,   # M365 E3 (no Teams)
    "06ebc4ee-1bb5-47dd-8120-11324bc54e06": 54.75,   # M365 E5 (no Teams)
    "f245ecc8-75af-4f8e-b61f-27d8114de5f3": 2.25,    # M365 F1
    "66b55226-6b4f-492c-910c-a3b7a3c9d993": 8.00,    # M365 F3
    # Office 365
    "4b585984-651b-448a-9e53-3b10f069cf7f": 8.00,    # O365 F3
    "18181a46-0d4e-45cd-891e-60aabd171b4e": 12.50,   # O365 E1
    "6634e0ce-1a9f-428c-a498-f84ec7b8aa2e": 22.00,   # O365 E2
    "6fd2c87f-b296-42f0-b197-1e91e994b900": 36.00,   # O365 E3 (same SKU)
    # Microsoft 365 Business
    "3b555118-da6a-4418-894f-7df1e2096870": 6.00,    # M365 Business Basic
    "f245ecc8-75af-4f8e-b61f-27d8114de5f4": 12.50,   # M365 Business Standard
    "cbdc14ab-d96c-4c30-b9f4-6ada7cdc1d46": 22.00,   # M365 Business Premium
    # Dynamics 365
    "726a0894-c82e-4f66-bc0f-a6c05c229006": 115.00,  # D365 CE Plan
    "ea126fc5-a19e-42e2-a731-da9d437bffcf": 210.00,  # D365 Plan
    "8e7a3d30-d97d-43ab-837c-d7701cef83dc": 8.00,    # D365 Team Members
    "338148b6-1b2e-4736-8805-6fc3a5a8ebe1": 70.00,   # D365 BC Essential
    "2880026b-2b0c-4251-8656-5d41ff11e3aa": 100.00,  # D365 BC Premium
    # Power Platform
    "1f2f344a-700d-42c9-9427-5cea1d5d7ba6": 10.00,   # Power BI Pro
    "f8a1db68-be16-40ed-86d5-cb42ce701560": 20.00,   # Power BI PPU
    "a403ebcc-fae0-4ca2-8c8c-7a907fd6c235": 15.00,   # Power Automate per User
    "dcb1a3ae-b7d7-4571-b55e-07c3d6213d0e": 20.00,   # Power Apps per User
    # Exchange / EMS / Intune
    "4a82b400-a79f-41a4-b4e2-e94f5787b113": 4.00,    # Exchange Online Plan 1
    "19ec0d23-8335-4cbd-94ac-6050e30712fa": 8.00,    # Exchange Online Plan 2
    "efccb6f7-5641-4e0e-bd10-b4976e1bf68e": 11.60,   # EMS E3
    "b05e124f-c7cc-45a0-a6aa-8cf78c946968": 16.40,   # EMS E5
    "061f9ace-7d42-4136-88ac-31dc755f143f": 8.00,    # Intune Plan 1
    # Azure AD / Entra ID
    "078d2b04-f1bd-4111-bbd4-b4b1b354cef4": 6.00,    # Azure AD P1
    "84a661c4-e949-4bd2-a560-ed7766fcaf2b": 9.00,    # Azure AD P2
    # Visio / Project
    "4b244418-9658-4451-a2b8-b5e2b364e9bd": 5.00,    # Visio Plan 1
    "c5928f49-12ba-48f7-ada3-0d743a3601d5": 15.00,   # Visio Plan 2
    "beb6439c-caad-48d3-bf46-0c82871e12be": 10.00,   # Project Plan 1
    "53818b1b-4a27-454b-8896-0dba576410e6": 30.00,   # Project Plan 3
    "09015f9f-377f-4538-bbb5-f75ceb09358a": 55.00,   # Project Plan 5
    # Copilot
    "639dec6b-bb19-468b-871c-c5c441c4b0cb": 30.00,   # M365 Copilot
}

# Fallback: match by skuPartNumber substring (case-insensitive)
_SKU_PRICE_BY_PART: dict[str, float] = {
    "SPE_E3": 36.00, "SPE_E5": 57.00,
    "SPE_F1": 2.25, "SPE_F5": 8.00,
    "ENTERPRISEPACK": 23.00,               # O365 E3
    "ENTERPRISEPREMIUM": 38.00,            # O365 E5
    "DESKLESSPACK": 8.00,                  # O365 F3
    "EXCHANGESTANDARD": 4.00,              # Exchange P1
    "EXCHANGEENTERPRISE": 8.00,            # Exchange P2
    "O365_BUSINESS_ESSENTIALS": 6.00,
    "O365_BUSINESS_PREMIUM": 12.50,
    "SMB_BUSINESS_PREMIUM": 22.00,
    "POWER_BI_PRO": 10.00,
    "POWER_BI_PREMIUM": 20.00,
    "DYN365_ENTERPRISE_PLAN1": 115.00,
    "DYN365_ENTERPRISE_TEAM_MEMBERS": 8.00,
    "DYN365_BUSCENTRAL_ESSENTIAL": 70.00,
    "DYN365_BUSCENTRAL_PREMIUM": 100.00,
    "FLOW_PER_USER": 15.00,
    "POWERAPPS_PER_USER": 20.00,
    "INTUNE_A": 8.00,
    "EMSPREMIUM": 16.40,
    "EMS": 11.60,
    "AAD_PREMIUM": 6.00,
    "AAD_PREMIUM_P2": 9.00,
    "VISIOCLIENT": 15.00,
    "PROJECTPREMIUM": 55.00,
    "PROJECTPROFESSIONAL": 30.00,
    "PROJECTESSENTIALS": 10.00,
    "MICROSOFT_365_COPILOT": 30.00,
}


def _estimate_sku_price(sku_id: str, sku_part_number: str) -> float | None:
    """Look up estimated per-user/month price for a SKU.

    Returns None if the SKU is not in any lookup table.
    """
    # Direct SKU ID match first
    price = _SKU_PRICE_BY_ID.get(sku_id)
    if price is not None:
        return price
    # Fallback: partial match on skuPartNumber
    part_upper = (sku_part_number or "").upper()
    for key, val in _SKU_PRICE_BY_PART.items():
        if key in part_upper:
            return val
    return None


# ---------------------------------------------------------------------------
# PAYG / self-service / unlimited SKU detection
# ---------------------------------------------------------------------------

# Microsoft Graph sometimes reports pay-as-you-go / self-service allocations
# with sentinel purchased quantities rather than real committed seat counts.
# For utilisation reporting, these should be treated as fully utilised even
# though the raw purchased number is preserved from the source system.

_PAYG_SENTINEL_TOTALS = {10_000, 100_000, 1_000_000}


def _is_payg_sku(sku: dict) -> bool:
    """Return True if this SKU should be treated as a PAYG/self-service allocation."""
    total = sku.get("total_licenses", 0)
    if total <= 0:
        return False
    return total in _PAYG_SENTINEL_TOTALS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _graph_get(token: str, url: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {token}", "ConsistencyLevel": "eventual"},
        )
        resp.raise_for_status()
        return resp.json()


async def _graph_get_pages(token: str, url: str, max_pages: int = 50) -> list[dict]:
    """Paginate through Graph API results."""
    all_items: list[dict] = []
    page = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while url and page < max_pages:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}", "ConsistencyLevel": "eventual"},
            )
            resp.raise_for_status()
            data = resp.json()
            all_items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
            page += 1
    return all_items


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_license_skus(token: str, gaps: DataGapCollector) -> dict:
    """Retrieve tenant license SKUs."""
    try:
        data = await _graph_get(token, f"{GRAPH_URL}/subscribedSkus")
        skus = []
        for sku in data.get("value", []):
            sku_id = sku.get("skuId", "")
            total = sku.get("prepaidUnits", {}).get("enabled", 0)
            consumed = sku.get("consumedUnits", 0)
            available = max(0, total - consumed)
            sku_rec = {
                "sku_id": sku_id,
                "sku_part_number": sku.get("skuPartNumber", ""),
                "friendly_name": SKU_NAMES.get(sku_id, sku.get("skuPartNumber", "")),
                "applies_to": sku.get("appliesTo", ""),
                "capability_status": sku.get("capabilityStatus", ""),
                "consumed_units": consumed,
                "prepaid_units": {
                    "enabled": total,
                    "suspended": sku.get("prepaidUnits", {}).get("suspended", 0),
                    "warning": sku.get("prepaidUnits", {}).get("warning", 0),
                },
                "total_licenses": total,
                "assigned_licenses": consumed,
                "available_licenses": available,
            }
            # Tag self-service / PAYG SKUs so the frontend can filter them
            sku_rec["is_payg"] = _is_payg_sku(sku_rec)
            skus.append(sku_rec)
        return {"skus": skus, "total_skus": len(skus), "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("License SKUs failed: %s", exc)
        gaps.add_gap(
            module="Licenses",
            field="skus",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Graph token with Directory.Read.All scope.",
        )
        return {"skus": [], "total_skus": 0, "data_gaps": gaps.get_gaps()}


async def get_licensed_users(token: str, gaps: DataGapCollector) -> dict:
    """Retrieve licensed users with optional sign-in activity."""
    try:
        # Use beta for signInActivity (requires AuditLog.Read.All)
        has_signin = True
        select = (
            "id,displayName,userPrincipalName,mail,accountEnabled,"
            "assignedLicenses,signInActivity"
        )
        url = f"{GRAPH_BETA}/users?$select={select}&$filter=assignedLicenses/$count ne 0&$count=true&$top=999"

        try:
            users_raw = await _graph_get_pages(token, url)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (403, 400):
                # signInActivity not available — fall back without it
                has_signin = False
                select = "id,displayName,userPrincipalName,mail,accountEnabled,assignedLicenses"
                url = f"{GRAPH_URL}/users?$select={select}&$filter=assignedLicenses/$count ne 0&$count=true&$top=999"
                users_raw = await _graph_get_pages(token, url)
                gaps.add_gap(
                    module="Licenses",
                    field="sign_in_activity",
                    reason="AuditLog.Read.All scope not available; sign-in data omitted.",
                    severity="low",
                    remediation="Grant AuditLog.Read.All to the application for sign-in tracking.",
                )
            else:
                raise

        users = []
        for u in users_raw:
            sia = u.get("signInActivity", {}) or {}
            assigned = u.get("assignedLicenses", [])
            users.append({
                "user_id": u.get("id", ""),
                "display_name": u.get("displayName", ""),
                "upn": u.get("userPrincipalName", ""),
                "email": u.get("mail", ""),
                "enabled": u.get("accountEnabled", True),
                "license_count": len(assigned),
                "assigned_sku_ids": [a.get("skuId", "") for a in assigned],
                "last_sign_in": sia.get("lastSignInDateTime"),
                "last_non_interactive_sign_in": sia.get("lastNonInteractiveSignInDateTime"),
            })

        return {"users": users, "total_count": len(users), "has_sign_in_data": has_signin, "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Licensed users failed: %s", exc)
        gaps.add_gap(
            module="Licenses",
            field="users",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Graph token with Directory.Read.All scope.",
        )
        return {"users": [], "total_count": 0, "has_sign_in_data": False, "data_gaps": gaps.get_gaps()}


async def get_license_summary(token: str, gaps: DataGapCollector) -> dict:
    """Summarise license utilisation."""
    try:
        sku_data = await get_license_skus(token, gaps)
        user_data = await get_licensed_users(token, gaps)

        skus = sku_data.get("skus", [])
        users = user_data.get("users", [])

        # Separate committed (purchased) vs PAYG/self-service SKUs for sane totals
        committed_skus = [s for s in skus if not _is_payg_sku(s)]
        payg_skus = [s for s in skus if _is_payg_sku(s)]

        # Totals based on committed SKUs only (PAYG seats aren't real purchases)
        total_licensed = sum(s.get("total_licenses", 0) for s in committed_skus)
        total_assigned = sum(s.get("assigned_licenses", 0) for s in committed_skus)
        total_available = sum(s.get("available_licenses", 0) for s in committed_skus)
        # Add PAYG consumed seats to assigned total (they are real users)
        total_assigned += sum(s.get("assigned_licenses", 0) for s in payg_skus)
        # For overall totals, count PAYG consumed seats as both licensed and assigned
        total_licensed += sum(s.get("assigned_licenses", 0) for s in payg_skus)

        utilisation_pct = round(total_assigned / total_licensed * 100, 1) if total_licensed else 0

        # Inactive users (no sign-in in 90 days)
        inactive_users = 0
        if user_data.get("has_sign_in_data"):
            from datetime import datetime, timedelta, timezone

            cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            for u in users:
                last = u.get("last_sign_in")
                if last:
                    try:
                        dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                        if dt < cutoff:
                            inactive_users += 1
                    except Exception:
                        pass
                else:
                    # No sign-in recorded at all
                    inactive_users += 1

        # Over-provisioned SKUs (exclude PAYG/self-service from this list)
        over_provisioned = [
            {
                "sku": s.get("friendly_name", s.get("sku_part_number", "")),
                "available": s.get("available_licenses", 0),
                "total": s.get("total_licenses", 0),
            }
            for s in skus
            if s.get("available_licenses", 0) > 0 and not _is_payg_sku(s)
        ]

        # --- Waste estimation ------------------------------------------------
        # 1) Unassigned-seat waste: available_licenses × unit price per SKU
        #    PAYG / self-service SKUs are excluded — their empty seats are free.
        unassigned_waste = 0.0
        priced_skus = 0
        total_monthly_cost = 0.0
        payg_sku_count = 0
        for s in skus:
            price = _estimate_sku_price(
                s.get("sku_id", ""), s.get("sku_part_number", "")
            )
            if price is not None:
                priced_skus += 1
                is_payg = _is_payg_sku(s)
                if is_payg:
                    payg_sku_count += 1
                    # PAYG: cost = consumed (assigned) seats only
                    total_monthly_cost += s.get("assigned_licenses", 0) * price
                    # No unassigned waste for PAYG — empty seats cost nothing
                else:
                    # Committed/purchased: cost = total seats
                    total_monthly_cost += s.get("total_licenses", 0) * price
                    unassigned_waste += s.get("available_licenses", 0) * price

        # 2) Inactive-user waste: for users inactive 90d+, estimate their
        #    average seat cost from the priced SKUs they hold.
        inactive_waste = 0.0
        if inactive_users > 0 and user_data.get("has_sign_in_data"):
            from datetime import datetime, timedelta, timezone as tz
            cutoff90 = datetime.now(tz.utc) - timedelta(days=90)
            for u in users:
                last = u.get("last_sign_in")
                is_inactive = False
                if last:
                    try:
                        dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                        is_inactive = dt < cutoff90
                    except Exception:
                        pass
                else:
                    is_inactive = True
                if is_inactive:
                    # Sum the per-SKU price for each license the user holds
                    for sid in u.get("assigned_sku_ids", []):
                        # Find the SKU record to get part number
                        sku_rec = next(
                            (s for s in skus if s.get("sku_id") == sid), None
                        )
                        if sku_rec:
                            p = _estimate_sku_price(
                                sid, sku_rec.get("sku_part_number", "")
                            )
                            if p is not None:
                                inactive_waste += p

        # Total estimated waste = unassigned seats + inactive user seats
        # (avoid double-counting: unassigned seats are NOT held by any user,
        #  inactive waste is from seats that ARE assigned but unused)
        estimated_waste = round(unassigned_waste + inactive_waste, 2)
        estimated_cost = round(total_monthly_cost, 2) if priced_skus > 0 else None
        waste_is_estimated = priced_skus > 0

        if not waste_is_estimated:
            gaps.add_gap(
                module="Licenses",
                field="estimated_waste",
                reason="No SKU pricing data matched; waste estimate unavailable.",
                severity="low",
                remediation="Add SKU pricing data or use procurement cost data.",
            )

        return {
            "total_sku_count": len(skus),
            "total_licensed_seats": total_licensed,
            "total_assigned_seats": total_assigned,
            "total_available_seats": total_available,
            "utilisation_percent": utilisation_pct,
            "unique_licensed_users": len(users),
            "inactive_users_90d": inactive_users,
            "over_provisioned_skus": over_provisioned,
            "estimated_monthly_cost": estimated_cost,
            "estimated_waste_monthly": estimated_waste if waste_is_estimated else None,
            "unassigned_seat_waste": round(unassigned_waste, 2) if waste_is_estimated else None,
            "inactive_user_waste": round(inactive_waste, 2) if waste_is_estimated else None,
            "priced_sku_count": priced_skus,
            "payg_sku_count": payg_sku_count,
            "pricing_note": (
                "Based on Microsoft list prices (USD). Actual EA/CSP pricing may differ. "
                f"{payg_sku_count} self-service/PAYG SKU(s) excluded from waste — "
                "only consumed seats are counted for those."
                if payg_sku_count > 0
                else "Based on Microsoft list prices (USD). Actual EA/CSP pricing may differ."
            ),
            "payg_note": (
                "SKUs reported by Microsoft Graph with purchased quantities of 10,000, 100,000, or 1,000,000 are flagged as pay-as-you-go allocations for reporting clarity. "
                "For these SKUs, imported purchased, consumed, available, and utilisation values are preserved as returned by the source system, and the underutilised status is presented as not applicable."
            ),
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("License summary failed: %s", exc)
        gaps.add_gap(
            module="Licenses",
            field="summary",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Graph token with Directory.Read.All.",
        )
        return {
            "total_sku_count": 0,
            "total_licensed_seats": 0,
            "total_assigned_seats": 0,
            "total_available_seats": 0,
            "utilisation_percent": 0,
            "unique_licensed_users": 0,
            "inactive_users_90d": 0,
            "over_provisioned_skus": [],
            "data_gaps": gaps.get_gaps(),
        }
