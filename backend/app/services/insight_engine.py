"""Insight engine — rule-based executive insight generation.

Aggregates data from all modules and produces:
  - Executive insights (high-level findings)
  - Cross-module recommendations
  - Risk indicators
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Insight rules
# ---------------------------------------------------------------------------

# Each rule is a callable: (module_data) -> list[dict] | None
# module_data is a dict with keys matching module names, each containing
# the response from that module's summary/data endpoint.


def _cost_insights(data: dict) -> list[dict]:
    """Generate cost-related insights."""
    insights: list[dict] = []
    costs = data.get("costs", {})

    total_1m = costs.get("total_cost_1m", 0)
    trend = costs.get("overall_trend", "stable")
    trend_pct = costs.get("trend_percent", 0)

    if trend == "increasing" and abs(trend_pct) > 10:
        insights.append({
            "category": "cost",
            "severity": "high",
            "title": "Significant cost increase detected",
            "description": (
                f"Monthly Azure spend has increased by {abs(trend_pct):.0f}% "
                f"(current: ${total_1m:,.0f}/mo). Review top cost drivers "
                f"and right-sizing opportunities."
            ),
            "recommendation": "Review Advisor cost recommendations and consider reserved instances for stable workloads.",
        })
    elif trend == "decreasing" and abs(trend_pct) > 10:
        insights.append({
            "category": "cost",
            "severity": "info",
            "title": "Cost reduction trend",
            "description": f"Monthly spend decreased by {abs(trend_pct):.0f}%. Current: ${total_1m:,.0f}/mo.",
            "recommendation": "Continue monitoring to ensure reduction is intentional.",
        })

    # Top cost drivers
    drivers = costs.get("top_cost_drivers", [])
    if drivers and len(drivers) >= 2:
        top = drivers[0]
        top_pct = (top.get("cost_1m", 0) / total_1m * 100) if total_1m > 0 else 0
        if top_pct > 50:
            insights.append({
                "category": "cost",
                "severity": "medium",
                "title": f"Cost concentration in {top.get('resource_type', 'unknown')}",
                "description": (
                    f"{top.get('resource_type', '')} accounts for {top_pct:.0f}% of total spend. "
                    f"High concentration increases risk from price changes."
                ),
                "recommendation": "Assess alternative architectures or negotiate committed spend.",
            })

    return insights


def _security_insights(data: dict) -> list[dict]:
    """Generate security-related insights."""
    insights: list[dict] = []
    defender = data.get("security", {})

    overall_pct = defender.get("overall_percentage", 0)
    if overall_pct > 0:
        if overall_pct < 50:
            insights.append({
                "category": "security",
                "severity": "high",
                "title": "Low Defender for Cloud secure score",
                "description": f"Overall secure score is {overall_pct}%. Significant security improvements needed.",
                "recommendation": "Address high-impact Defender recommendations immediately.",
            })
        elif overall_pct < 70:
            insights.append({
                "category": "security",
                "severity": "medium",
                "title": "Moderate Defender secure score",
                "description": f"Secure score is {overall_pct}%. Room for improvement.",
                "recommendation": "Prioritise medium and high impact Defender recommendations.",
            })

    # Advisor recommendations count
    advisor = data.get("advisor", {})
    rec_count = advisor.get("total_count", 0)
    if rec_count > 20:
        insights.append({
            "category": "operations",
            "severity": "medium",
            "title": f"{rec_count} unaddressed Advisor recommendations",
            "description": "A high number of Advisor recommendations indicates opportunities for improvement.",
            "recommendation": "Triage and address recommendations by impact category.",
        })

    return insights


def _license_insights(data: dict) -> list[dict]:
    """Generate license-related insights."""
    insights: list[dict] = []
    lic = data.get("licenses", {})

    utilisation = lic.get("utilisation_percent", 0)
    if utilisation > 0:
        available = lic.get("total_available_seats", 0)
        if utilisation < 70:
            insights.append({
                "category": "cost",
                "severity": "high",
                "title": "Low license utilisation",
                "description": (
                    f"Only {utilisation}% of purchased licenses are assigned. "
                    f"{available} seats are unused."
                ),
                "recommendation": "Reduce license quantities at next renewal to match actual usage.",
            })
        elif utilisation < 85:
            insights.append({
                "category": "cost",
                "severity": "medium",
                "title": "Moderate license utilisation",
                "description": f"{utilisation}% utilisation with {available} available seats.",
                "recommendation": "Review unused licenses and consider right-sizing at renewal.",
            })

    inactive_90d = lic.get("inactive_users_90d", 0)
    total_users = lic.get("unique_licensed_users", 0)
    if inactive_90d > 0 and total_users > 0:
        pct = round(inactive_90d / total_users * 100, 1)
        if pct > 10:
            insights.append({
                "category": "cost",
                "severity": "high",
                "title": f"{inactive_90d} licensed users inactive for 90+ days",
                "description": (
                    f"{pct}% of licensed users haven't signed in for 90 days. "
                    f"Estimated waste: review licenses for these users."
                ),
                "recommendation": "Reassign or remove licenses from inactive users.",
            })

    return insights


def _integration_insights(data: dict) -> list[dict]:
    """Generate integration insights."""
    insights: list[dict] = []
    integ = data.get("integrations", {})

    total = integ.get("total_count", integ.get("total_integrations", 0))
    if total == 0:
        insights.append({
            "category": "integrations",
            "severity": "info",
            "title": "No integrations discovered",
            "description": "No ADF, Logic App, or networking integrations found. This may indicate a gap in discovery scope.",
            "recommendation": "Confirm all subscriptions are included and appropriate permissions are granted.",
        })
    elif total > 50:
        insights.append({
            "category": "integrations",
            "severity": "medium",
            "title": f"Complex integration landscape ({total} connections)",
            "description": "A high number of integrations increases operational complexity and risk.",
            "recommendation": "Document integration dependencies and establish monitoring.",
        })

    return insights


def _inventory_insights(data: dict) -> list[dict]:
    """Generate inventory-related insights."""
    insights: list[dict] = []
    inv = data.get("inventory", {})

    total_resources = inv.get("total_resource_count", 0)
    sub_count = inv.get("subscription_count", 0)
    rg_count = inv.get("resource_group_count", 0)

    if sub_count > 10:
        insights.append({
            "category": "governance",
            "severity": "medium",
            "title": f"Large subscription footprint ({sub_count} subscriptions)",
            "description": "Multiple subscriptions increase governance complexity.",
            "recommendation": "Ensure management groups and policies are applied consistently.",
        })

    if rg_count > 0 and total_resources > 0:
        avg_per_rg = total_resources / rg_count
        if avg_per_rg > 100:
            insights.append({
                "category": "governance",
                "severity": "low",
                "title": "Dense resource groups",
                "description": f"Average {avg_per_rg:.0f} resources per resource group. Consider splitting for clarity.",
                "recommendation": "Organise resources into purpose-specific resource groups.",
            })

    return insights


def _dynamics_insights(data: dict) -> list[dict]:
    """Generate D365 insights."""
    insights: list[dict] = []
    d365 = data.get("dynamics", {})
    if not isinstance(d365, dict):
        d365 = {}
    if not d365 and isinstance(data.get("dynamics_workflows"), dict):
        d365 = {"workflows": data.get("dynamics_workflows", {})}

    wf = d365.get("workflows", {})
    inactive = wf.get("inactive_count", 0)
    total = wf.get("total_count", 0)
    if total > 0 and inactive > total * 0.3:
        insights.append({
            "category": "operations",
            "severity": "medium",
            "title": f"{inactive} inactive workflows in Dynamics 365",
            "description": f"{inactive}/{total} workflows are inactive. Review and clean up unused workflows.",
            "recommendation": "Archive or delete obsolete workflows to reduce clutter.",
        })

    return insights


def _data_gap_insights(data: dict) -> list[dict]:
    """Generate insights about data gaps themselves."""
    insights: list[dict] = []
    all_gaps: list[dict] = data.get("data_gaps", [])
    high_gaps = [g for g in all_gaps if g.get("severity") == "high"]

    if high_gaps:
        modules = list(set(g.get("module", "") for g in high_gaps))
        insights.append({
            "category": "data_quality",
            "severity": "high",
            "title": f"{len(high_gaps)} high-severity data gaps detected",
            "description": (
                f"Data collection failed for critical areas: {', '.join(modules)}. "
                f"Assessment accuracy may be impacted."
            ),
            "recommendation": "Review permissions and connectivity. Re-run affected modules.",
        })

    return insights


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

ALL_RULES = [
    _cost_insights,
    _security_insights,
    _license_insights,
    _integration_insights,
    _inventory_insights,
    _dynamics_insights,
    _data_gap_insights,
]


def generate_insights(module_data: dict[str, Any]) -> dict:
    """Run all insight rules against collected module data.

    Args:
        module_data: Dict with keys like "costs", "security", "licenses",
                     "integrations", "inventory", "dynamics", "data_gaps".
                     Each value is the summary response from that module.

    Returns:
        Dict with ``insights`` list and ``recommendation_count``.
    """
    all_insights: list[dict] = []

    for rule_fn in ALL_RULES:
        try:
            results = rule_fn(module_data)
            if results:
                all_insights.extend(results)
        except Exception as exc:
            logger.warning("Insight rule %s failed: %s", rule_fn.__name__, exc)

    # Sort by severity: high → medium → low → info
    severity_order = {"high": 0, "medium": 1, "low": 2, "info": 3}
    all_insights.sort(key=lambda i: severity_order.get(i.get("severity", "info"), 4))

    return {
        "insights": all_insights,
        "total_count": len(all_insights),
        "by_category": _count_by(all_insights, "category"),
        "by_severity": _count_by(all_insights, "severity"),
    }


def generate_recommendations(module_data: dict[str, Any]) -> dict:
    """Extract and aggregate recommendations from all modules.

    Combines Advisor recommendations, integration recommendations,
    and insight-driven recommendations into a unified list.
    """
    recs: list[dict] = []

    # Advisor recommendations
    advisor = module_data.get("advisor", {})
    for rec in advisor.get("recommendations", [])[:20]:  # Top 20
        recs.append({
            "source": "Azure Advisor",
            "category": rec.get("category", ""),
            "impact": rec.get("impact", ""),
            "title": rec.get("short_description", ""),
            "description": rec.get("description", ""),
            "resource_id": rec.get("resource_id", ""),
        })

    # Integration recommendations
    integ_recs = module_data.get("integration_recommendations", {})
    for rec in integ_recs.get("recommendations", []):
        recs.append({
            "source": "Integration Analysis",
            "category": rec.get("category", ""),
            "impact": rec.get("severity", ""),
            "title": rec.get("title", ""),
            "description": rec.get("description", ""),
            "resource_id": "",
        })

    # Insight-based recommendations
    insights = generate_insights(module_data)
    for insight in insights.get("insights", []):
        if insight.get("recommendation"):
            recs.append({
                "source": "Assessment Insight",
                "category": insight.get("category", ""),
                "impact": insight.get("severity", ""),
                "title": insight.get("title", ""),
                "description": insight.get("recommendation", ""),
                "resource_id": "",
            })

    return {
        "recommendations": recs,
        "total_count": len(recs),
        "by_source": _count_by(recs, "source"),
    }


def _count_by(items: list[dict], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        val = item.get(key, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts
