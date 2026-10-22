"""Advisor service — Azure Advisor scores and recommendations.

Uses the Azure Advisor REST API to retrieve scores and recommendations.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from app.services.azure_auth import StaticTokenCredential, extract_bearer_token_async
from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

MANAGEMENT_URL = "https://management.azure.com"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _arm_get(token: str, path: str, api_version: str) -> dict:
    """Generic ARM REST GET."""
    url = f"{MANAGEMENT_URL}{path}?api-version={api_version}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        return resp.json()


async def _get_subscriptions(token: str) -> dict[str, str]:
    """Return {subscription_id: display_name} for enabled subs."""
    data = await _arm_get(token, "/subscriptions", "2022-09-01")
    return {
        s["subscriptionId"]: s.get("displayName", s["subscriptionId"])
        for s in data.get("value", [])
        if s.get("state") == "Enabled"
    }


async def _get_subscription_ids(token: str) -> list[str]:
    data = await _arm_get(token, "/subscriptions", "2022-09-01")
    return [
        s["subscriptionId"]
        for s in data.get("value", [])
        if s.get("state") == "Enabled"
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_advisor_scores(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Retrieve Advisor scores (Cost, Security, Reliability, Performance, OpEx).

    Uses the ``/providers/Microsoft.Advisor/advisorScore`` endpoint at
    subscription scope and aggregates results.
    """
    try:
        token = await extract_bearer_token_async(credential)
        sub_map = await _get_subscriptions(token)
        sub_ids = list(sub_map.keys())
        all_scores: list[dict] = []

        async def _scores_for_sub(sub_id: str) -> list[dict]:
            try:
                data = await _arm_get(
                    token,
                    f"/subscriptions/{sub_id}/providers/Microsoft.Advisor/advisorScore",
                    "2023-01-01",
                )
                results = []
                for item in data.get("value", []):
                    props = item.get("properties", {})
                    category = item.get("name", "Unknown")
                    score_val = props.get("lastRefreshedScore", {})
                    results.append({
                        "subscription_id": sub_id,
                        "subscription_name": sub_map.get(sub_id, sub_id),
                        "category": category,
                        "score": score_val.get("score", 0),
                        "potential_score_increase": score_val.get("potentialScoreIncrease", 0),
                        "date": score_val.get("date", ""),
                    })
                return results
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    gaps.add_gap(
                        module="Security",
                        field=f"advisor_score_{sub_id}",
                        reason="Advisor scores not available for this subscription.",
                        severity="low",
                        remediation="Advisor scores may take 24h to appear.",
                    )
                    return []
                raise

        results = await asyncio.gather(
            *[asyncio.wait_for(_scores_for_sub(sid), timeout=30) for sid in sub_ids],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, list):
                all_scores.extend(r)
            elif isinstance(r, Exception):
                logger.warning("Advisor score sub-query failed: %s", r)

        # Aggregate across subscriptions — skip GUID-like category names
        _GUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-', re.IGNORECASE)
        category_scores: dict[str, list[float]] = {}
        category_potential: dict[str, list[float]] = {}
        for s in all_scores:
            cat = s["category"]
            if _GUID_RE.match(cat):
                continue  # skip subscriptions / GUIDs that leak as category names
            category_scores.setdefault(cat, []).append(s["score"])
            category_potential.setdefault(cat, []).append(s.get("potential_score_increase", 0) or 0)

        aggregated = [
            {
                "category": cat,
                "score": round(sum(vals) / len(vals), 1),
                "potential_score_increase": round(sum(category_potential.get(cat, [0])) / len(category_potential.get(cat, [1])), 1),
            }
            for cat, vals in category_scores.items()
        ]

        return {
            "scores_by_subscription": all_scores,
            "aggregated_scores": aggregated,
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Advisor scores failed: %s", exc)
        gaps.add_gap(
            module="Security",
            field="advisor_scores",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Advisor Reader role on subscriptions.",
        )
        return {
            "scores_by_subscription": [],
            "aggregated_scores": [],
            "data_gaps": gaps.get_gaps(),
        }


async def get_advisor_recommendations(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Retrieve all Advisor recommendations across subscriptions."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_map = await _get_subscriptions(token)
        sub_ids = list(sub_map.keys())
        all_recs: list[dict] = []

        async def _recs_for_sub(sub_id: str) -> list[dict]:
            results: list[dict] = []
            try:
                url: str | None = (
                    f"{MANAGEMENT_URL}/subscriptions/{sub_id}"
                    f"/providers/Microsoft.Advisor/recommendations?api-version=2023-01-01"
                )
                headers = {"Authorization": f"Bearer {token}"}

                async with httpx.AsyncClient(timeout=30) as client:
                    while url:
                        resp = await client.get(url, headers=headers)
                        if resp.status_code == 404:
                            break
                        resp.raise_for_status()
                        data = resp.json()
                        for rec in data.get("value", []):
                            props = rec.get("properties", {})
                            results.append({
                                "id": rec.get("id", ""),
                                "subscription_id": sub_id,
                                "subscription_name": sub_map.get(sub_id, sub_id),
                                "category": props.get("category", ""),
                                "impact": props.get("impact", ""),
                                "impacted_field": props.get("impactedField", ""),
                                "impacted_value": props.get("impactedValue", ""),
                                "short_description": props.get("shortDescription", {}).get("solution", ""),
                                "description": props.get("shortDescription", {}).get("problem", ""),
                                "resource_id": props.get("resourceMetadata", {}).get("resourceId", ""),
                                "last_updated": props.get("lastUpdated", ""),
                            })
                        url = data.get("nextLink")
            except Exception as sub_exc:
                logger.warning(
                    "Advisor recommendations failed for sub %s: %s", sub_id, sub_exc
                )
                gaps.add_gap(
                    module="Security",
                    field=f"advisor_rec_{sub_id}",
                    reason=format_gap_reason(sub_exc),
                    severity="medium",
                    remediation="Check Advisor access on subscription.",
                )
            return results

        results = await asyncio.gather(
            *[asyncio.wait_for(_recs_for_sub(sid), timeout=30) for sid in sub_ids],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, list):
                all_recs.extend(r)
            elif isinstance(r, Exception):
                logger.warning("Advisor recs sub-query failed: %s", r)

        # Summary by category
        category_counts: dict[str, int] = {}
        for r in all_recs:
            cat = r["category"]
            category_counts[cat] = category_counts.get(cat, 0) + 1

        return {
            "recommendations": all_recs,
            "total_count": len(all_recs),
            "by_category": category_counts,
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Advisor recommendations failed: %s", exc)
        gaps.add_gap(
            module="Security",
            field="advisor_recommendations",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Reader role on subscriptions.",
        )
        return {
            "recommendations": [],
            "total_count": 0,
            "by_category": {},
            "data_gaps": gaps.get_gaps(),
        }
