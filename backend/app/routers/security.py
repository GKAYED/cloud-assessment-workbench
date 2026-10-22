"""Security router — Advisor scores, recommendations, Defender secure scores, CSPM insights.

Endpoints:
  GET /api/security/advisor-scores
  GET /api/security/advisor-recommendations
  GET /api/security/defender-scores
  GET /api/security/cspm-insights
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_credential, get_gap_collector
from app.services.azure_auth import StaticTokenCredential
from app.services.data_gap_collector import DataGapCollector

router = APIRouter(prefix="/api/security", tags=["security"])


@router.get("/advisor-scores")
async def advisor_scores(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.advisor_service import get_advisor_scores
    result = await get_advisor_scores(credential, gaps)
    if not isinstance(result, dict):
        return {
            "aggregated_scores": [],
            "scores_by_subscription": [],
            "data_gaps": [],
        }

    aggregated = result.get("aggregated_scores", [])
    by_subscription = result.get("scores_by_subscription", [])

    for item in aggregated:
        item.setdefault("pillar", item.get("category", ""))
        item.setdefault("max_score", 100)
        item.setdefault("percentage", round(item.get("score", 0), 1))

    for item in by_subscription:
        item.setdefault("pillar", item.get("category", ""))
        item.setdefault("max_score", 100)
        item.setdefault("percentage", round(item.get("score", 0), 1))

    return {
        "aggregated_scores": aggregated,
        "scores_by_subscription": by_subscription,
        "data_gaps": result.get("data_gaps", []),
    }


@router.get("/advisor-recommendations")
async def advisor_recommendations(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.advisor_service import get_advisor_recommendations
    result = await get_advisor_recommendations(credential, gaps)
    if isinstance(result, dict):
        recs = result.get("recommendations", [])
        # Add alias fields expected by demo shape
        for r in recs:
            r.setdefault("resource_name", r.get("impacted_value", ""))
            r.setdefault("resource_type", r.get("impacted_field", ""))
            r.setdefault("description", r.get("short_description", ""))
            r.setdefault("remediation", r.get("description", ""))
        return recs
    return result


@router.get("/defender-scores")
async def defender_scores(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.security_service import get_defender_scores
    result = await get_defender_scores(credential, gaps)
    if isinstance(result, dict):
        return {
            "scores": result.get("scores", []),
            "overall_percentage": result.get("overall_percentage", 0),
            "overall_current": result.get("overall_current", 0),
            "overall_max": result.get("overall_max", 0),
            "controls": result.get("controls", []),
            "posture_summary": result.get("posture_summary"),
        }
    return {
        "scores": result,
        "overall_percentage": 0,
        "overall_current": 0,
        "overall_max": 0,
        "controls": [],
        "posture_summary": None,
    }


@router.get("/cspm-insights")
async def cspm_insights(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.security_service import get_cspm_insights

    result = await get_cspm_insights(credential, gaps)
    if isinstance(result, dict):
        return result
    return {
        "already_covered": [],
        "subscription_count": 0,
        "assessment_summary": {"totals": {}, "by_subscription": [], "top_findings": []},
        "attack_path_summary": {"totals": {}, "by_subscription": [], "top_paths": []},
        "unavailable_signals": [],
        "data_gaps": [],
    }
