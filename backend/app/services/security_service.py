"""Security service — Microsoft Defender for Cloud secure scores and CSPM insights.

Uses Microsoft Defender for Cloud REST and Azure Resource Graph queries to
retrieve secure scores, assessments, and attack-path posture signals across
enabled subscriptions.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

from app.services.azure_auth import StaticTokenCredential, extract_bearer_token_async
from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

MANAGEMENT_URL = "https://management.azure.com"
RESOURCE_GRAPH_URL = f"{MANAGEMENT_URL}/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01"
DEFENDER_SUB_CONCURRENCY = 2
DEFENDER_RETRY_ATTEMPTS = 3
DEFENDER_MAX_BACKOFF_SEC = 8.0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _arm_get(token: str, path: str, api_version: str) -> dict:
    url = f"{MANAGEMENT_URL}{path}?api-version={api_version}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        return resp.json()


async def _resource_graph_query(
    token: str,
    query: str,
    subscription_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body: dict[str, Any] = {
        "query": query,
        "options": {"$top": 1000, "resultFormat": "objectArray"},
    }
    if subscription_ids:
        body["subscriptions"] = subscription_ids

    rows: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            resp = await client.post(RESOURCE_GRAPH_URL, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            rows.extend(data.get("data", []))
            skip_token = data.get("$skipToken")
            if not skip_token:
                break
            body["options"]["$skipToken"] = skip_token
    return rows


async def _get_subscription_ids(token: str) -> list[str]:
    data = await _arm_get(token, "/subscriptions", "2022-09-01")
    return [
        s["subscriptionId"]
        for s in data.get("value", [])
        if s.get("state") == "Enabled"
    ]


async def _get_subscriptions(token: str) -> dict[str, str]:
    """Return {subscription_id: display_name} for enabled subs."""
    data = await _arm_get(token, "/subscriptions", "2022-09-01")
    return {
        s["subscriptionId"]: s.get("displayName", s["subscriptionId"])
        for s in data.get("value", [])
        if s.get("state") == "Enabled"
    }


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _slugify(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in (value or "")).strip("_")


def _retry_delay(attempt: int) -> float:
    base = min(2 ** max(attempt - 1, 0), DEFENDER_MAX_BACKOFF_SEC)
    return min(base + random.uniform(0.1, 0.6), DEFENDER_MAX_BACKOFF_SEC)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_defender_scores(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Retrieve Microsoft Defender secure scores per subscription.

    Uses ``/providers/Microsoft.Security/secureScores/ascScore`` at
    subscription scope. If Defender for Cloud is not onboarded, the
    endpoint returns 404 — this is reported as a data gap.
    """
    try:
        token = await extract_bearer_token_async(credential)
        sub_map = await _get_subscriptions(token)
        sub_ids = list(sub_map.keys())
        scores: list[dict] = []
        score_semaphore = asyncio.Semaphore(DEFENDER_SUB_CONCURRENCY)

        async def _score_for_sub(sub_id: str) -> dict | None:
            async with score_semaphore:
                last_exc: Exception | None = None
                for attempt in range(1, DEFENDER_RETRY_ATTEMPTS + 1):
                    try:
                        data = await _arm_get(
                            token,
                            f"/subscriptions/{sub_id}/providers/Microsoft.Security/secureScores/ascScore",
                            "2020-01-01",
                        )
                        props = data.get("properties", {})
                        score_details = props.get("score", {})
                        return {
                            "subscription_id": sub_id,
                            "subscription_name": sub_map.get(sub_id, sub_id),
                            "current_score": score_details.get("current", 0),
                            "max_score": score_details.get("max", 0),
                            "percentage": round(score_details.get("percentage", 0) * 100, 1),
                            "weight": props.get("weight", 0),
                        }
                    except httpx.HTTPStatusError as exc:
                        if exc.response.status_code in (404, 403):
                            gaps.add_gap(
                                module="Security",
                                field=f"defender_score_{sub_id}",
                                reason=format_gap_reason(exc, "Defender for Cloud not onboarded or insufficient permissions"),
                                severity="medium",
                                remediation=(
                                    "Enable Defender for Cloud on this subscription "
                                    "or grant Security Reader role."
                                ),
                            )
                            return None
                        last_exc = exc
                        if attempt < DEFENDER_RETRY_ATTEMPTS and exc.response.status_code in (408, 409, 429, 500, 502, 503, 504):
                            await asyncio.sleep(_retry_delay(attempt))
                            continue
                        break
                    except (httpx.TimeoutException, httpx.NetworkError) as exc:
                        last_exc = exc
                        if attempt < DEFENDER_RETRY_ATTEMPTS:
                            await asyncio.sleep(_retry_delay(attempt))
                            continue
                        break

                if last_exc is not None:
                    gaps.add_gap(
                        module="Security",
                        field=f"defender_score_{sub_id}",
                        reason=format_gap_reason(last_exc, "Could not retrieve Defender secure score for subscription"),
                        severity="medium",
                        remediation="Retry the pull and ensure Security Reader access on the subscription.",
                    )
                return None

        score_results = await asyncio.gather(
            *[_score_for_sub(sid) for sid in sub_ids],
            return_exceptions=True,
        )
        for r in score_results:
            if isinstance(r, dict):
                scores.append(r)
            elif isinstance(r, Exception):
                logger.warning("Defender score sub-query failed: %s", r)

        # Compute weighted average across subscriptions (matching Azure methodology)
        total_current = sum(s["current_score"] for s in scores)
        total_max = sum(s["max_score"] for s in scores)
        total_weight = sum(s["weight"] for s in scores)
        if total_weight > 0:
            # Azure uses weight-based average: sum(percentage * weight) / sum(weight)
            # Per-sub percentages are already 0-100 at this point
            overall_pct = round(
                sum(s["percentage"] * s["weight"] for s in scores)
                / total_weight,
                1,
            )
        else:
            # Fallback when weights are unavailable
            overall_pct = round(total_current / total_max * 100, 1) if total_max else 0

        # Fetch secure score controls for breakdown
        controls: list[dict] = []
        controls_semaphore = asyncio.Semaphore(DEFENDER_SUB_CONCURRENCY)

        async def _controls_for_sub(sub_id: str) -> list[dict]:
            async with controls_semaphore:
                last_exc: Exception | None = None
                for attempt in range(1, DEFENDER_RETRY_ATTEMPTS + 1):
                    try:
                        data = await _arm_get(
                            token,
                            f"/subscriptions/{sub_id}/providers/Microsoft.Security/secureScores/ascScore/secureScoreControls",
                            "2020-01-01",
                        )
                        results = []
                        for ctrl in data.get("value", []):
                            cp = ctrl.get("properties", {})
                            sd = cp.get("score", {})
                            results.append({
                                "subscription_id": sub_id,
                                "name": cp.get("displayName", ""),
                                "current_score": sd.get("current", 0),
                                "max_score": sd.get("max", 0),
                                "percentage": round(sd.get("percentage", 0) * 100, 1),
                                "healthy_count": cp.get("healthyResourceCount", 0),
                                "unhealthy_count": cp.get("unhealthyResourceCount", 0),
                                "not_applicable_count": cp.get("notApplicableResourceCount", 0),
                            })
                        return results
                    except httpx.HTTPStatusError as exc:
                        last_exc = exc
                        if attempt < DEFENDER_RETRY_ATTEMPTS and exc.response.status_code in (408, 409, 429, 500, 502, 503, 504):
                            await asyncio.sleep(_retry_delay(attempt))
                            continue
                        break
                    except (httpx.TimeoutException, httpx.NetworkError) as exc:
                        last_exc = exc
                        if attempt < DEFENDER_RETRY_ATTEMPTS:
                            await asyncio.sleep(_retry_delay(attempt))
                            continue
                        break

                if last_exc is not None:
                    gaps.add_gap(
                        module="Security",
                        field=f"defender_controls_{sub_id}",
                        reason=format_gap_reason(last_exc, "Could not retrieve Defender secure score controls for subscription"),
                        severity="medium",
                        remediation="Retry the pull and ensure Security Reader access on the subscription.",
                    )
                return []

        ctrl_results = await asyncio.gather(
            *[_controls_for_sub(sid) for sid in sub_ids],
            return_exceptions=True,
        )
        for r in ctrl_results:
            if isinstance(r, list):
                controls.extend(r)

        # Compute posture summary from controls
        total_healthy = sum(c["healthy_count"] for c in controls)
        total_unhealthy = sum(c["unhealthy_count"] for c in controls)
        total_not_applicable = sum(c["not_applicable_count"] for c in controls)
        control_names = {c["name"] for c in controls if c["name"]}
        # A control is "at risk" if any subscription has it below 80%
        at_risk_names = {c["name"] for c in controls if c["percentage"] < 80 and c["name"]}

        return {
            "scores": scores,
            "overall_current": total_current,
            "overall_max": total_max,
            "overall_percentage": overall_pct,
            "controls": controls,
            "posture_summary": {
                "total_healthy": total_healthy,
                "total_unhealthy": total_unhealthy,
                "total_not_applicable": total_not_applicable,
                "total_controls": len(control_names),
                "controls_at_risk": len(at_risk_names),
            },
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Defender scores failed: %s", exc)
        gaps.add_gap(
            module="Security",
            field="defender_scores",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Security Reader role on subscriptions.",
        )
        return {
            "scores": [],
            "overall_current": 0,
            "overall_max": 0,
            "overall_percentage": 0,
            "controls": [],
            "data_gaps": gaps.get_gaps(),
        }


async def get_cspm_insights(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Retrieve CSPM-aligned posture signals across enabled subscriptions.

    Buckets:
    1. Already covered in AzAudit today
    2. Extra CSPM telemetry we can pull now
    3. Signals not currently pulled, surfaced as notes + data gaps
    """
    already_covered = [
        {
            "id": "defender_secure_score",
            "title": "Defender secure score and control posture",
            "coverage": "Available",
            "detail": "Already shown in AzAudit from Microsoft Defender for Cloud secure score and control telemetry.",
            "source": "Microsoft Defender for Cloud",
        },
        {
            "id": "advisor_security_recommendations",
            "title": "Azure Advisor security recommendations",
            "coverage": "Available",
            "detail": "Already shown in AzAudit from Azure Advisor recommendation and pillar score data.",
            "source": "Azure Advisor",
        },
    ]

    unavailable_signals = [
        {
            "id": "cloud_security_explorer",
            "title": "Cloud Security Explorer query results",
            "status": "No data pulled",
            "detail": "No dedicated Cloud Security Explorer collector is currently implemented in AzAudit.",
            "remediation": "Add a dedicated collector if Explorer-grade query results are required in the assessment workspace.",
        },
        {
            "id": "api_security_posture",
            "title": "API security posture dashboard findings",
            "status": "No data pulled",
            "detail": "No dedicated API security posture collector is currently implemented in AzAudit.",
            "remediation": "Add a dedicated collector if API posture findings need to be reported alongside CSPM posture.",
        },
    ]

    for signal in unavailable_signals:
        gaps.add_gap(
            module="Security",
            field=f"cspm_{signal['id']}",
            reason=signal["detail"],
            severity="low",
            remediation=signal["remediation"],
        )

    try:
        token = await extract_bearer_token_async(credential)
        sub_map = await _get_subscriptions(token)
        sub_ids = list(sub_map.keys())
        if not sub_ids:
            gaps.add_gap(
                module="Security",
                field="cspm_enabled_subscriptions",
                reason="No enabled subscriptions were available for CSPM queries.",
                severity="medium",
                remediation="Ensure the active profile has access to at least one enabled subscription.",
            )
            return {
                "already_covered": already_covered,
                "subscription_count": 0,
                "assessment_summary": {
                    "totals": {},
                    "by_subscription": [],
                    "top_findings": [],
                },
                "attack_path_summary": {
                    "totals": {},
                    "by_subscription": [],
                    "top_paths": [],
                },
                "unavailable_signals": unavailable_signals,
                "data_gaps": gaps.get_gaps(),
            }

        assessment_rows: list[dict[str, Any]] = []
        attack_path_rows: list[dict[str, Any]] = []

        assessment_query = """
        securityresources
        | where type =~ 'microsoft.security/assessments'
        | extend
            subscription_id = subscriptionId,
            assessment_name = tostring(properties.displayName),
            status_code = tostring(properties.status.code),
            severity = tostring(properties.metadata.severity)
        | summarize
            total = count(),
            unhealthy = countif(tolower(status_code) == 'unhealthy'),
            healthy = countif(tolower(status_code) == 'healthy'),
            exempt = countif(tolower(status_code) == 'exempt'),
            high = countif(tolower(severity) == 'high'),
            medium = countif(tolower(severity) == 'medium'),
            low = countif(tolower(severity) == 'low')
          by subscription_id
        """

        assessment_top_query = """
        securityresources
        | where type =~ 'microsoft.security/assessments'
        | extend
            assessment_name = tostring(properties.displayName),
            status_code = tostring(properties.status.code),
            severity = tostring(properties.metadata.severity)
        | where tolower(status_code) == 'unhealthy'
        | summarize unhealthy = count(), subscriptions = dcount(subscriptionId) by assessment_name, severity
        | top 10 by unhealthy desc
        """

        attack_path_query = """
        securityresources
        | where type =~ 'microsoft.security/attackpaths'
        | extend
            subscription_id = subscriptionId,
            risk_level = tostring(properties.riskLevel)
        | summarize
            total = count(),
            critical = countif(tolower(risk_level) == 'critical'),
            high = countif(tolower(risk_level) == 'high'),
            medium = countif(tolower(risk_level) == 'medium'),
            low = countif(tolower(risk_level) == 'low')
          by subscription_id
        """

        attack_path_top_query = """
        securityresources
        | where type =~ 'microsoft.security/attackpaths'
        | extend
            path_name = coalesce(tostring(properties.displayName), tostring(name)),
            risk_level = tostring(properties.riskLevel),
            exposed_entity = tostring(properties.entryPointEntityName),
            target_entity = tostring(properties.targetEntityName)
        | project path_name, risk_level, exposed_entity, target_entity, subscriptionId
        | top 10 by risk_level desc
        """

        try:
            assessment_rows = await _resource_graph_query(token, assessment_query, sub_ids)
        except Exception as exc:
            logger.warning("CSPM assessment query failed: %s", exc)
            gaps.add_gap(
                module="Security",
                field="cspm_assessments",
                reason=format_gap_reason(exc, "No data pulled for Defender CSPM assessments"),
                severity="medium",
                remediation="Ensure Defender for Cloud assessment data and Resource Graph access are available.",
            )

        try:
            assessment_top_rows = await _resource_graph_query(token, assessment_top_query, sub_ids)
        except Exception as exc:
            logger.warning("CSPM assessment top-findings query failed: %s", exc)
            assessment_top_rows = []
            gaps.add_gap(
                module="Security",
                field="cspm_assessment_top_findings",
                reason=format_gap_reason(exc, "No data pulled for top unhealthy CSPM findings"),
                severity="low",
                remediation="Ensure Defender for Cloud assessment data and Resource Graph access are available.",
            )

        try:
            attack_path_rows = await _resource_graph_query(token, attack_path_query, sub_ids)
        except Exception as exc:
            logger.warning("CSPM attack-path query failed: %s", exc)
            gaps.add_gap(
                module="Security",
                field="cspm_attack_paths",
                reason=format_gap_reason(exc, "No data pulled for Defender attack paths"),
                severity="medium",
                remediation="Ensure Defender CSPM/attack-path data is enabled and Resource Graph access is available.",
            )

        try:
            attack_path_top_rows = await _resource_graph_query(token, attack_path_top_query, sub_ids)
        except Exception as exc:
            logger.warning("CSPM top attack-path query failed: %s", exc)
            attack_path_top_rows = []
            gaps.add_gap(
                module="Security",
                field="cspm_attack_path_details",
                reason=format_gap_reason(exc, "No data pulled for attack-path details"),
                severity="low",
                remediation="Ensure Defender CSPM/attack-path data is enabled and Resource Graph access is available.",
            )

        if not assessment_rows:
            gaps.add_gap(
                module="Security",
                field="cspm_assessments_empty",
                reason="No CSPM assessment rows were returned for enabled subscriptions.",
                severity="medium",
                remediation="Confirm Defender for Cloud assessment telemetry is enabled for in-scope subscriptions.",
            )

        assessment_by_subscription = [
            {
                "subscription_id": row.get("subscription_id", ""),
                "subscription_name": sub_map.get(row.get("subscription_id", ""), row.get("subscription_id", "")),
                "total": _int(row.get("total")),
                "unhealthy": _int(row.get("unhealthy")),
                "healthy": _int(row.get("healthy")),
                "exempt": _int(row.get("exempt")),
                "high": _int(row.get("high")),
                "medium": _int(row.get("medium")),
                "low": _int(row.get("low")),
            }
            for row in assessment_rows
        ]
        assessment_by_subscription.sort(key=lambda item: (-item["unhealthy"], item["subscription_name"]))
        assessment_totals = {
            "total": sum(item["total"] for item in assessment_by_subscription),
            "unhealthy": sum(item["unhealthy"] for item in assessment_by_subscription),
            "healthy": sum(item["healthy"] for item in assessment_by_subscription),
            "exempt": sum(item["exempt"] for item in assessment_by_subscription),
            "high": sum(item["high"] for item in assessment_by_subscription),
            "medium": sum(item["medium"] for item in assessment_by_subscription),
            "low": sum(item["low"] for item in assessment_by_subscription),
        }
        assessment_top_findings = [
            {
                "name": row.get("assessment_name") or "Unnamed assessment",
                "severity": row.get("severity") or "Unknown",
                "unhealthy": _int(row.get("unhealthy")),
                "subscriptions": _int(row.get("subscriptions")),
            }
            for row in assessment_top_rows
        ]

        attack_path_by_subscription = [
            {
                "subscription_id": row.get("subscription_id", ""),
                "subscription_name": sub_map.get(row.get("subscription_id", ""), row.get("subscription_id", "")),
                "total": _int(row.get("total")),
                "critical": _int(row.get("critical")),
                "high": _int(row.get("high")),
                "medium": _int(row.get("medium")),
                "low": _int(row.get("low")),
            }
            for row in attack_path_rows
        ]
        attack_path_by_subscription.sort(key=lambda item: (-item["total"], item["subscription_name"]))
        attack_path_totals = {
            "total": sum(item["total"] for item in attack_path_by_subscription),
            "critical": sum(item["critical"] for item in attack_path_by_subscription),
            "high": sum(item["high"] for item in attack_path_by_subscription),
            "medium": sum(item["medium"] for item in attack_path_by_subscription),
            "low": sum(item["low"] for item in attack_path_by_subscription),
        }
        attack_path_top_paths = [
            {
                "name": row.get("path_name") or "Unnamed attack path",
                "risk_level": row.get("risk_level") or "Unknown",
                "subscription_name": sub_map.get(row.get("subscriptionId", ""), row.get("subscriptionId", "")),
                "entry_point": row.get("exposed_entity") or "",
                "target": row.get("target_entity") or "",
            }
            for row in attack_path_top_rows
        ]

        return {
            "already_covered": already_covered,
            "subscription_count": len(sub_ids),
            "assessment_summary": {
                "totals": assessment_totals,
                "by_subscription": assessment_by_subscription,
                "top_findings": assessment_top_findings,
            },
            "attack_path_summary": {
                "totals": attack_path_totals,
                "by_subscription": attack_path_by_subscription,
                "top_paths": attack_path_top_paths,
            },
            "unavailable_signals": unavailable_signals,
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("CSPM insights failed: %s", exc)
        gaps.add_gap(
            module="Security",
            field="cspm_insights",
            reason=format_gap_reason(exc, "No CSPM posture data pulled"),
            severity="high",
            remediation="Ensure the active profile has Security Reader and Resource Graph access across in-scope subscriptions.",
        )
        return {
            "already_covered": already_covered,
            "subscription_count": 0,
            "assessment_summary": {"totals": {}, "by_subscription": [], "top_findings": []},
            "attack_path_summary": {"totals": {}, "by_subscription": [], "top_paths": []},
            "unavailable_signals": unavailable_signals,
            "data_gaps": gaps.get_gaps(),
        }
