"""WAF/CAF Engine — maps assessment data to Azure framework pillars.

Maps collected Azure assessment data onto:
  - Azure Well-Architected Framework (WAF) five pillars
  - Cloud Adoption Framework (CAF) methodologies

Phase 1 scope: derive scores from available data (Advisor, Defender,
cost analysis, inventory, integrations).
Deep-dive items (HA/DR design, Zero Trust, pen testing, etc.) are
flagged as Phase 2 opportunities.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WAF_PILLARS = {
    "reliability": {
        "code": "RE",
        "name": "Reliability",
        "description": "Ensure workloads meet availability and resilience targets.",
        "checklist_range": "RE:01\u2013RE:10",
    },
    "security": {
        "code": "SE",
        "name": "Security",
        "description": "Protect workloads and data from threats.",
        "checklist_range": "SE:01\u2013SE:12",
    },
    "cost_optimization": {
        "code": "CO",
        "name": "Cost Optimization",
        "description": "Optimise spend while meeting requirements.",
        "checklist_range": "CO:01\u2013CO:14",
    },
    "operational_excellence": {
        "code": "OE",
        "name": "Operational Excellence",
        "description": "Streamline operations, monitoring, and deployment.",
        "checklist_range": "OE:01\u2013OE:11",
    },
    "performance_efficiency": {
        "code": "PE",
        "name": "Performance Efficiency",
        "description": "Right-size resources and meet performance targets.",
        "checklist_range": "PE:01\u2013PE:09",
    },
}

CAF_METHODOLOGIES = {
    "strategy": {"name": "Strategy", "description": "Define business justification and expected outcomes."},
    "plan": {"name": "Plan", "description": "Align actionable adoption plans to business outcomes."},
    "ready": {"name": "Ready", "description": "Prepare the cloud environment for planned changes."},
    "adopt": {"name": "Adopt", "description": "Implement desired technology changes (Migrate / Innovate)."},
    "govern": {"name": "Govern", "description": "Establish guardrails for the environment."},
    "secure": {"name": "Secure", "description": "Improve security posture over time."},
    "manage": {"name": "Manage", "description": "Operations management for cloud and hybrid solutions."},
}

MATURITY_LEVELS = ["Not Assessed", "Initial", "Developing", "Defined", "Managed", "Optimised"]

# Map Advisor categories -> WAF pillar keys
_ADVISOR_MAP = {
    "reliability": "reliability",
    "highavailability": "reliability",
    "high availability": "reliability",
    "security": "security",
    "cost": "cost_optimization",
    "operationalexcellence": "operational_excellence",
    "operational excellence": "operational_excellence",
    "performance": "performance_efficiency",
}


def _map_advisor_category(cat: str) -> str | None:
    normalised = cat.lower().replace(" ", "").strip()
    return _ADVISOR_MAP.get(normalised) or _ADVISOR_MAP.get(cat.lower().strip())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_advisor_scores(module_data: dict) -> list[dict]:
    """Return advisor scores as a flat list regardless of response shape."""
    raw = module_data.get("advisor_scores", [])
    if isinstance(raw, dict):
        candidates = []
        if isinstance(raw.get("scores_by_subscription"), list):
            candidates = raw.get("scores_by_subscription", [])
        elif isinstance(raw.get("aggregated_scores"), list):
            candidates = raw.get("aggregated_scores", [])
        elif isinstance(raw.get("scores"), list):
            candidates = raw.get("scores", [])
        elif isinstance(raw.get("data"), list):
            candidates = raw.get("data", [])

        normalized: list[dict] = []
        for row in candidates:
            if not isinstance(row, dict):
                continue
            r = dict(row)
            if r.get("percentage") is None and r.get("score") is not None:
                try:
                    r["percentage"] = float(r.get("score", 0))
                except Exception:
                    r["percentage"] = 0
            normalized.append(r)
        return normalized
    return raw if isinstance(raw, list) else []


def _extract_advisor_recs(module_data: dict) -> list[dict]:
    raw = module_data.get("advisor_recommendations", [])
    if isinstance(raw, dict):
        return raw.get("recommendations", raw.get("data", []))
    return raw if isinstance(raw, list) else []


def _advisor_category_percentages(module_data: dict, category_key: str) -> list[float]:
    percentages: list[float] = []
    for score in _extract_advisor_scores(module_data):
        cat = _map_advisor_category(score.get("pillar", "") or score.get("category", ""))
        if cat != category_key:
            continue
        try:
            value = float(score.get("percentage", 0) or 0)
        except (TypeError, ValueError):
            continue
        if value > 0:
            percentages.append(value)
    return percentages


def _advisor_category_average(module_data: dict, category_key: str) -> float | None:
    percentages = _advisor_category_percentages(module_data, category_key)
    if not percentages:
        return None
    return round(sum(percentages) / len(percentages), 1)


def _waf_result(scores: list[float], findings: list[dict], phase2_opportunities: list[dict]) -> dict:
    has_data = len(scores) > 0
    score = round(sum(scores) / len(scores), 1) if has_data else 0
    return {
        "score": score,
        "has_data": has_data,
        "findings": findings,
        "evidence_count": len(findings),
        "phase2_opportunities": phase2_opportunities,
    }


def _caf_result(maturity: int, signals: list[str], *, sub_dimensions: list[dict] | None = None, next_level_actions: list[dict] | None = None, top_recommendations: list[dict] | None = None, top_controls: list[dict] | None = None) -> dict:
    clamped = max(0, min(maturity, 5))
    return {
        "maturity": clamped,
        "maturity_label": MATURITY_LEVELS[clamped],
        "signals": signals,
        "has_signals": len(signals) > 0,
        "sub_dimensions": sub_dimensions or [],
        "next_level_actions": next_level_actions or [],
        "top_recommendations": top_recommendations or [],
        "top_controls": top_controls or [],
    }


def _sub_dim(name: str, status: str, score: float | None, signals: list[str]) -> dict:
    """Build a sub-dimension dict.

    status: 'good' | 'warning' | 'poor' | 'no-data'
    score: 0-100 numeric or None if not measurable
    """
    return {"name": name, "status": status, "score": score, "signals": signals}


def _status_from_score(score: float | None, good: float = 80, warn: float = 50) -> str:
    if score is None:
        return "no-data"
    if score >= good:
        return "good"
    if score >= warn:
        return "warning"
    return "poor"


def _next_action(action: str, current_value: str, target_value: str, impact: str = "medium") -> dict:
    return {"action": action, "current_value": current_value, "target_value": target_value, "impact": impact}


def _extract_defender_controls(module_data: dict) -> list[dict]:
    """Return Defender secure-score controls list."""
    sec = module_data.get("security", {})
    if isinstance(sec, dict):
        return sec.get("controls", [])
    return []


def _extract_policy_compliance(module_data: dict) -> dict:
    return module_data.get("policy_compliance", {}) if isinstance(module_data.get("policy_compliance"), dict) else {}


def _extract_rbac(module_data: dict) -> dict:
    return module_data.get("role_assignments", {}) if isinstance(module_data.get("role_assignments"), dict) else {}


def _extract_orphans(module_data: dict) -> dict:
    return module_data.get("orphaned_resources", {}) if isinstance(module_data.get("orphaned_resources"), dict) else {}


def _policy_compliance_rate(policy_data: dict) -> float | None:
    """Return overall compliance rate (0-100) or None if no data."""
    subs = policy_data.get("by_subscription", [])
    if not subs:
        return None
    total_resources = sum(s.get("total_resources", 0) for s in subs)
    total_compliant = sum(s.get("compliant", 0) for s in subs)
    if total_resources <= 0:
        return None
    return round((total_compliant / total_resources) * 100, 1)


# ---------------------------------------------------------------------------
# WAF pillar scorers
# ---------------------------------------------------------------------------

def _score_reliability(module_data: dict) -> dict:
    findings: list[dict] = []
    scores: list[float] = []

    for s in _extract_advisor_scores(module_data):
        if _map_advisor_category(s.get("pillar", "") or s.get("category", "")) == "reliability":
            pct = s.get("percentage", 0)
            scores.append(pct)
            findings.append({
                "source": "Azure Advisor",
                "subscription_name": s.get("subscription_name") or s.get("subscription_id") or "All subscriptions",
                "detail": f"Reliability score: {pct:.0f}%",
                "checklist_ref": "RE:07",
            })

    integ = module_data.get("integrations", {})
    if isinstance(integ, dict):
        total = integ.get("total_count", 0) or integ.get("total_integrations", 0) or 0
        has_health_metrics = any(
            key in integ for key in ("degraded_count", "failing_count", "degraded", "failing", "healthy")
        )
        degraded = integ.get("degraded_count", 0) or integ.get("degraded", 0) or 0
        failing = integ.get("failing_count", 0) or integ.get("failing", 0) or 0
        if total > 0 and has_health_metrics:
            healthy_pct = max(0, ((total - degraded - failing) / total) * 100)
            scores.append(healthy_pct)
            if degraded + failing > 0:
                findings.append({"source": "Integration Analysis", "detail": f"{degraded + failing}/{total} integrations degraded or failing.", "checklist_ref": "RE:05"})
        elif total > 0:
            findings.append({
                "source": "Integration Analysis",
                "detail": "Integration inventory is available, but runtime health telemetry is not currently measured.",
                "checklist_ref": "RE:05",
            })

    return _waf_result(
        scores=scores,
        findings=findings,
        phase2_opportunities=[
            {"title": "HA/DR Design Review", "description": "Assess redundancy, failover, and disaster recovery design for critical workloads.", "ref": "RE:05, RE:09"},
            {"title": "Failure Mode Analysis", "description": "Conduct failure mode analysis for key application flows.", "ref": "RE:03"},
            {"title": "Reliability Testing", "description": "Chaos engineering and fault-injection testing for critical paths.", "ref": "RE:08"},
        ],
    )


def _score_security(module_data: dict) -> dict:
    findings: list[dict] = []
    scores: list[float] = []

    # Defender secure score
    defender = module_data.get("security", {})
    if isinstance(defender, dict):
        overall_pct = defender.get("overall_percentage", 0) or 0
        if overall_pct > 0:
            scores.append(overall_pct)
            findings.append({"source": "Microsoft Defender for Cloud", "detail": f"Secure score: {overall_pct:.0f}%", "checklist_ref": "SE:01"})
    elif isinstance(defender, list) and defender:
        avg = sum(d.get("percentage", 0) for d in defender) / len(defender)
        scores.append(avg)
        findings.append({"source": "Microsoft Defender for Cloud", "detail": f"Average secure score: {avg:.0f}%", "checklist_ref": "SE:01"})

    for s in _extract_advisor_scores(module_data):
        if _map_advisor_category(s.get("pillar", "") or s.get("category", "")) == "security":
            pct = s.get("percentage", 0)
            scores.append(pct)
            findings.append({
                "source": "Azure Advisor",
                "subscription_name": s.get("subscription_name") or s.get("subscription_id") or "All subscriptions",
                "detail": f"Security score: {pct:.0f}%",
                "checklist_ref": "SE:01",
            })

    high_sec = [r for r in _extract_advisor_recs(module_data) if r.get("category", "").lower() == "security" and r.get("impact") == "High"]
    if high_sec:
        findings.append({"source": "Advisor Recommendations", "detail": f"{len(high_sec)} high-impact security recommendations unresolved.", "checklist_ref": "SE:01"})

    return _waf_result(
        scores=scores,
        findings=findings,
        phase2_opportunities=[
            {"title": "Zero Trust Assessment", "description": "Evaluate identity verification, least-privilege access, and micro-segmentation.", "ref": "SE:04, SE:05"},
            {"title": "Identity & Access Deep Review", "description": "Conditional Access policies, PIM, service principal hygiene.", "ref": "SE:05"},
            {"title": "Network Security Review", "description": "NSG rules, private endpoints, WAF configuration.", "ref": "SE:06"},
            {"title": "Data Protection Audit", "description": "Encryption at rest/in-transit, key management, secrets rotation.", "ref": "SE:07"},
            {"title": "Incident Response Planning", "description": "Playbooks, SIEM integration, response drill.", "ref": "SE:10"},
        ],
    )


def _score_cost_optimization(module_data: dict) -> dict:
    findings: list[dict] = []
    scores: list[float] = []

    for s in _extract_advisor_scores(module_data):
        if _map_advisor_category(s.get("pillar", "") or s.get("category", "")) == "cost_optimization":
            pct = s.get("percentage", 0)
            scores.append(pct)
            findings.append({
                "source": "Azure Advisor",
                "subscription_name": s.get("subscription_name") or s.get("subscription_id") or "All subscriptions",
                "detail": f"Cost optimisation score: {pct:.0f}%",
                "checklist_ref": "CO:01",
            })

    costs = module_data.get("costs", {})
    if isinstance(costs, dict):
        trend = costs.get("overall_trend", "stable")
        trend_pct = costs.get("trend_percent", 0) or 0
        total_1m = costs.get("total_cost_1m", 0) or 0
        if total_1m > 0:
            if trend == "increasing" and abs(trend_pct) > 10:
                scores.append(max(0, 60 - abs(trend_pct)))
                findings.append({"source": "Cost Analysis", "detail": f"Spend increasing {abs(trend_pct):.0f}% \u2014 ${total_1m:,.0f}/mo.", "checklist_ref": "CO:05"})
            elif trend == "stable":
                scores.append(75)
            elif trend == "decreasing":
                scores.append(min(100, 80 + abs(trend_pct)))

    # License utilisation (if available)
    lic = module_data.get("licenses", {})
    if isinstance(lic, dict):
        util_pct = lic.get("utilisation_percent", 0) or lic.get("overall_utilization_pct", 0) or 0
        if util_pct > 0:
            scores.append(util_pct)
            if util_pct < 70:
                findings.append({"source": "License Analysis", "detail": f"License utilisation at {util_pct}% \u2014 significant waste.", "checklist_ref": "CO:01"})
            elif util_pct < 85:
                findings.append({"source": "License Analysis", "detail": f"License utilisation at {util_pct}% \u2014 room for optimisation.", "checklist_ref": "CO:01"})

    return _waf_result(
        scores=scores,
        findings=findings,
        phase2_opportunities=[
            {"title": "Reserved Instance Analysis", "description": "Identify stable workloads eligible for 1-yr or 3-yr reservations.", "ref": "CO:07"},
            {"title": "Right-Sizing Assessment", "description": "Evaluate over-provisioned VMs, databases, and App Service plans.", "ref": "CO:07"},
            {"title": "Spending Guardrails", "description": "Implement Azure Budgets, alerts, and cost management policies.", "ref": "CO:04"},
        ],
    )


def _score_operational_excellence(module_data: dict) -> dict:
    findings: list[dict] = []
    scores: list[float] = []

    for s in _extract_advisor_scores(module_data):
        if _map_advisor_category(s.get("pillar", "") or s.get("category", "")) == "operational_excellence":
            pct = s.get("percentage", 0)
            scores.append(pct)
            findings.append({
                "source": "Azure Advisor",
                "subscription_name": s.get("subscription_name") or s.get("subscription_id") or "All subscriptions",
                "detail": f"Operational Excellence score: {pct:.0f}%",
                "checklist_ref": "OE:01",
            })

    # D365 workflow health (if available)
    d365 = module_data.get("dynamics", {})
    if isinstance(d365, dict):
        wf = d365.get("workflows", {})
        if isinstance(wf, dict):
            wf_total = wf.get("total_count", 0) or 0
            wf_inactive = wf.get("inactive_count", 0) or 0
            if wf_total > 0:
                active_pct = ((wf_total - wf_inactive) / wf_total) * 100
                scores.append(active_pct)
                if wf_inactive > wf_total * 0.3:
                    findings.append({"source": "Dynamics 365", "detail": f"{wf_inactive}/{wf_total} workflows inactive \u2014 operational debt.", "checklist_ref": "OE:04"})

    # Data gap severity as OE signal
    gaps = module_data.get("data_gaps", [])
    if isinstance(gaps, list):
        high_gaps = [g for g in gaps if isinstance(g, dict) and g.get("severity") == "high"]
        if high_gaps:
            scores.append(max(0, 100 - len(high_gaps) * 15))
            findings.append({"source": "Data Quality", "detail": f"{len(high_gaps)} high-severity data gaps affecting assessment accuracy.", "checklist_ref": "OE:07"})

    return _waf_result(
        scores=scores,
        findings=findings,
        phase2_opportunities=[
            {"title": "IaC Maturity Assessment", "description": "Evaluate Infrastructure as Code adoption (Bicep, Terraform, ARM).", "ref": "OE:05"},
            {"title": "CI/CD Pipeline Review", "description": "Assess deployment automation, testing gates, rollback procedures.", "ref": "OE:06"},
            {"title": "Monitoring & Observability", "description": "Review Azure Monitor, Log Analytics, Application Insights coverage.", "ref": "OE:07"},
            {"title": "Incident Management Process", "description": "Evaluate alerting, escalation, and post-incident review practices.", "ref": "OE:08"},
        ],
    )


def _score_performance_efficiency(module_data: dict) -> dict:
    findings: list[dict] = []
    scores: list[float] = []

    for s in _extract_advisor_scores(module_data):
        if _map_advisor_category(s.get("pillar", "") or s.get("category", "")) == "performance_efficiency":
            pct = s.get("percentage", 0)
            scores.append(pct)
            findings.append({
                "source": "Azure Advisor",
                "subscription_name": s.get("subscription_name") or s.get("subscription_id") or "All subscriptions",
                "detail": f"Performance score: {pct:.0f}%",
                "checklist_ref": "PE:01",
            })

    return _waf_result(
        scores=scores,
        findings=findings,
        phase2_opportunities=[
            {"title": "Resource Scaling Review", "description": "Assess auto-scale rules, scale-set configuration, App Service plan sizing.", "ref": "PE:05"},
            {"title": "Performance Baselines", "description": "Establish baseline metrics for critical workloads.", "ref": "PE:04"},
            {"title": "Load Testing", "description": "Conduct load tests against key application endpoints.", "ref": "PE:06"},
        ],
    )


# ---------------------------------------------------------------------------
# CAF methodology assessments
# ---------------------------------------------------------------------------

def _assess_caf_strategy(md: dict) -> dict:
    signals: list[str] = []
    maturity = 1
    sub_dims: list[dict] = []
    next_actions: list[dict] = []
    top_recs: list[dict] = []

    # --- Sub-dimension: Application Portfolio ---
    portfolio = md.get("portfolio", [])
    portfolio_score: float | None = None
    portfolio_signals: list[str] = []
    if isinstance(portfolio, list) and portfolio:
        maturity = max(maturity, 2)
        signals.append(f"{len(portfolio)} applications catalogued in portfolio.")
        portfolio_signals.append(f"{len(portfolio)} apps catalogued.")
        with_fit = [a for a in portfolio if isinstance(a, dict) and a.get("strategic_fit") is not None]
        with_fs = [a for a in portfolio if isinstance(a, dict) and a.get("future_state")]
        if with_fit:
            maturity = max(maturity, 3)
            signals.append(f"{len(with_fit)} apps have strategic fit scores.")
            portfolio_signals.append(f"{len(with_fit)}/{len(portfolio)} have strategic fit scores.")
        if with_fs:
            maturity = max(maturity, 3)
            signals.append(f"{len(with_fs)} apps have future-state classification.")
            portfolio_signals.append(f"{len(with_fs)}/{len(portfolio)} have future-state classification.")
        # Score: % of apps with both strategic fit and future state
        fully_classified = len([a for a in portfolio if isinstance(a, dict) and a.get("strategic_fit") is not None and a.get("future_state")])
        portfolio_score = round((fully_classified / len(portfolio)) * 100, 1)
        if portfolio_score >= 80 and len(portfolio) >= 5:
            maturity = max(maturity, 4)
            signals.append("Strong portfolio rationalisation — majority of apps classified with strategic fit and future state.")
        if portfolio_score == 100 and len(portfolio) >= 10:
            maturity = max(maturity, 5)
            signals.append("Complete portfolio rationalisation across all catalogued apps.")
    sub_dims.append(_sub_dim("Application Portfolio", _status_from_score(portfolio_score), portfolio_score, portfolio_signals))

    # --- Sub-dimension: Cost Alignment ---
    cost_signals: list[str] = []
    cost_score: float | None = None
    # Use advisor cost category as a proxy for cost strategy alignment
    avg_cost_score = _advisor_category_average(md, "cost_optimization")
    if avg_cost_score is not None:
        cost_score = avg_cost_score
        cost_signals.append(f"Average Advisor cost optimisation score: {cost_score:.0f}%.")
    orphans = _extract_orphans(md)
    orphan_count = orphans.get("total_count", 0) or 0
    if orphan_count > 0:
        cost_signals.append(f"{orphan_count} orphaned resources — potential cost waste.")
    sub_dims.append(_sub_dim("Cost Alignment", _status_from_score(cost_score), cost_score, cost_signals))

    # --- Sub-dimension: Stakeholder Engagement (proxy: initiatives + portfolio) ---
    initiatives = md.get("initiatives", [])
    engage_signals: list[str] = []
    engage_score: float | None = None
    if isinstance(initiatives, list) and initiatives and isinstance(portfolio, list) and portfolio:
        engage_score = min(100, (len(initiatives) + len(portfolio)) * 10)
        engage_signals.append(f"{len(initiatives)} initiatives and {len(portfolio)} portfolio entries indicate stakeholder engagement.")
    elif isinstance(initiatives, list) and initiatives:
        engage_score = min(100, len(initiatives) * 15)
        engage_signals.append(f"{len(initiatives)} initiatives defined.")
    sub_dims.append(_sub_dim("Stakeholder Engagement", _status_from_score(engage_score, good=60, warn=30), engage_score, engage_signals))

    # --- Surface top cost recommendations ---
    for rec in _extract_advisor_recs(md):
        if rec.get("category", "").lower() == "cost" and rec.get("impact") in ("High", "Medium"):
            top_recs.append({"source": "Advisor", "category": "Cost", "impact": rec.get("impact", ""), "description": rec.get("short_description") or rec.get("description", "")})
            if len(top_recs) >= 5:
                break

    # --- Next level actions ---
    if maturity < 2:
        next_actions.append(_next_action("Catalogue applications in the portfolio", "0 apps", "≥5 apps", "high"))
    elif maturity < 3:
        next_actions.append(_next_action("Add strategic fit scores and future-state classifications to portfolio apps", f"{portfolio_score or 0:.0f}% classified", "≥50% classified", "high"))
    elif maturity < 4:
        next_actions.append(_next_action("Complete portfolio rationalisation for ≥80% of apps", f"{portfolio_score or 0:.0f}% classified", "≥80% classified", "medium"))
    elif maturity < 5:
        next_actions.append(_next_action("Achieve 100% portfolio rationalisation across ≥10 apps", f"{portfolio_score or 0:.0f}%", "100%", "low"))

    return _caf_result(maturity, signals, sub_dimensions=sub_dims, next_level_actions=next_actions, top_recommendations=top_recs)


def _assess_caf_plan(md: dict) -> dict:
    signals: list[str] = []
    maturity = 1
    sub_dims: list[dict] = []
    next_actions: list[dict] = []

    # --- Sub-dimension: Initiative Planning ---
    initiatives = md.get("initiatives", [])
    init_signals: list[str] = []
    init_score: float | None = None
    if isinstance(initiatives, list) and initiatives:
        maturity = max(maturity, 2)
        signals.append(f"{len(initiatives)} initiatives defined.")
        init_signals.append(f"{len(initiatives)} initiatives tracked.")
        with_q = [i for i in initiatives if isinstance(i, dict) and i.get("target_quarter")]
        if with_q:
            maturity = max(maturity, 3)
            signals.append(f"{len(with_q)} initiatives have target quarters.")
            init_signals.append(f"{len(with_q)}/{len(initiatives)} have target quarters.")
        with_owner = [
            i for i in initiatives
            if isinstance(i, dict) and (i.get("business_owner") or i.get("technical_owner"))
        ]
        if with_owner:
            init_signals.append(f"{len(with_owner)}/{len(initiatives)} have assigned owners.")
        # Score: % of initiatives that are fully planned (have quarter + owner)
        fully_planned = len([
            i
            for i in initiatives
            if isinstance(i, dict)
            and i.get("target_quarter")
            and (i.get("business_owner") or i.get("technical_owner"))
        ])
        init_score = round((fully_planned / len(initiatives)) * 100, 1) if initiatives else 0
        if init_score >= 80 and len(initiatives) >= 5:
            maturity = max(maturity, 4)
            signals.append("Comprehensive initiative planning with timelines and ownership.")
        if init_score == 100 and len(initiatives) >= 10:
            maturity = max(maturity, 5)
            signals.append("Full adoption plan coverage — all initiatives fully planned.")
    sub_dims.append(_sub_dim("Initiative Planning", _status_from_score(init_score), init_score, init_signals))

    # --- Sub-dimension: Skills Readiness ---
    # Proxy: if portfolio has apps with future_state, that implies skills planning
    portfolio = md.get("portfolio", [])
    skills_signals: list[str] = []
    skills_score: float | None = None
    if isinstance(portfolio, list) and portfolio:
        with_fs = [a for a in portfolio if isinstance(a, dict) and a.get("future_state")]
        if with_fs:
            skills_score = round((len(with_fs) / len(portfolio)) * 100, 1)
            skills_signals.append(f"{len(with_fs)}/{len(portfolio)} apps have future-state — implies skills gap analysis.")
    sub_dims.append(_sub_dim("Skills Readiness", _status_from_score(skills_score, good=60, warn=30), skills_score, skills_signals))

    # --- Sub-dimension: Digital Estate Assessment ---
    inv = md.get("inventory", {})
    estate_signals: list[str] = []
    estate_score: float | None = None
    if isinstance(inv, dict):
        total_res = inv.get("total_resource_count", 0) or inv.get("total_resources", 0) or 0
        rg_count = inv.get("resource_group_count", 0) or inv.get("total_resource_groups", 0) or 0
        if total_res > 0:
            estate_score = 100.0  # inventory exists = digital estate assessed
            estate_signals.append(f"{total_res} resources across {rg_count} resource groups discovered.")
    sub_dims.append(_sub_dim("Digital Estate Assessment", _status_from_score(estate_score), estate_score, estate_signals))

    # --- Next level actions ---
    if maturity < 2:
        next_actions.append(_next_action("Define adoption initiatives with business outcomes", "0 initiatives", "≥3 initiatives", "high"))
    elif maturity < 3:
        next_actions.append(_next_action("Set target quarters for all initiatives", f"{len([i for i in (initiatives if isinstance(initiatives, list) else []) if isinstance(i, dict) and i.get('target_quarter')])} have quarters", "All initiatives", "high"))
    elif maturity < 4:
        next_actions.append(_next_action("Assign owners and full planning details to ≥80% of initiatives", f"{init_score or 0:.0f}% fully planned", "≥80%", "medium"))
    elif maturity < 5:
        next_actions.append(_next_action("Complete planning for all initiatives (100% coverage)", f"{init_score or 0:.0f}%", "100%", "low"))

    return _caf_result(maturity, signals, sub_dimensions=sub_dims, next_level_actions=next_actions)


def _assess_caf_ready(md: dict) -> dict:
    signals: list[str] = []
    maturity = 1
    sub_dims: list[dict] = []
    next_actions: list[dict] = []

    inv = md.get("inventory", {})
    if not isinstance(inv, dict):
        inv = {}
    sub_count = inv.get("subscription_count", 0) or inv.get("total_subscriptions", 0) or 0
    rg_count = inv.get("resource_group_count", 0) or inv.get("total_resource_groups", 0) or 0
    total_res = inv.get("total_resource_count", 0) or inv.get("total_resources", 0) or 0
    untagged = inv.get("untagged_percentage", 100)

    if sub_count > 0:
        maturity = max(maturity, 2)
        signals.append(f"{sub_count} subscriptions discovered and catalogued.")
    if rg_count > 0:
        signals.append(f"{rg_count} resource groups with {total_res} resources.")

    # --- Sub-dimension: Naming & Tagging ---
    tag_signals: list[str] = []
    tag_score = max(0, 100.0 - untagged)
    if untagged < 30:
        maturity = max(maturity, 3)
        signals.append(f"Good tagging compliance ({100 - untagged:.0f}% tagged).")
        tag_signals.append(f"{100 - untagged:.0f}% of resources tagged.")
    elif untagged < 60:
        maturity = max(maturity, 2)
        signals.append(f"Moderate tagging compliance ({100 - untagged:.0f}% tagged).")
        tag_signals.append(f"{100 - untagged:.0f}% of resources tagged — room for improvement.")
    else:
        signals.append(f"Low tagging compliance ({100 - untagged:.0f}% tagged) \u2014 governance gap.")
        tag_signals.append(f"Only {100 - untagged:.0f}% tagged — significant governance gap.")
    sub_dims.append(_sub_dim("Naming & Tagging", _status_from_score(tag_score, good=70, warn=40), tag_score, tag_signals))

    # --- Sub-dimension: Subscription Design ---
    sub_design_signals: list[str] = []
    sub_design_score: float | None = None
    if sub_count > 0:
        sub_design_score = 60.0  # base: subscriptions exist
        sub_design_signals.append(f"{sub_count} subscriptions in use.")
        if sub_count > 1:
            sub_design_score = 75.0  # multi-sub indicates some design
            sub_design_signals.append("Multi-subscription design detected.")
        # RBAC check: is RBAC structured?
        rbac = _extract_rbac(md)
        owner_count = rbac.get("owner_count", 0) or 0
        if owner_count > 0:
            ratio = owner_count / max(sub_count, 1)
            if ratio <= 3:
                sub_design_score = min(100, sub_design_score + 15)
                sub_design_signals.append(f"Owner assignments well-controlled ({owner_count} total, ~{ratio:.1f}/sub).")
            else:
                sub_design_signals.append(f"High Owner count ({owner_count}, ~{ratio:.1f}/sub) — review least-privilege.")
    sub_dims.append(_sub_dim("Subscription Design", _status_from_score(sub_design_score, good=70, warn=40), sub_design_score, sub_design_signals))

    # --- Sub-dimension: Policy Baseline ---
    policy = _extract_policy_compliance(md)
    policy_signals: list[str] = []
    compliance_rate = _policy_compliance_rate(policy)
    if compliance_rate is not None:
        policy_signals.append(f"Policy compliance rate: {compliance_rate:.0f}%.")
        total_assignments = policy.get("total_policy_assignments", 0)
        if total_assignments > 0:
            policy_signals.append(f"{total_assignments} policy assignments active.")
        non_compliant_res = policy.get("total_non_compliant_resources", 0)
        if non_compliant_res > 0:
            policy_signals.append(f"{non_compliant_res} non-compliant resources to remediate.")
        if compliance_rate >= 90:
            maturity = max(maturity, 4)
            signals.append(f"Strong policy compliance ({compliance_rate:.0f}%) — landing zone well-governed.")
        elif compliance_rate >= 70:
            maturity = max(maturity, 3)
            signals.append(f"Moderate policy compliance ({compliance_rate:.0f}%).")
    sub_dims.append(_sub_dim("Policy Baseline", _status_from_score(compliance_rate, good=85, warn=60), compliance_rate, policy_signals))

    # --- Sub-dimension: Network Topology ---
    # Limited signal: presence of network resources in inventory
    net_signals: list[str] = []
    net_score: float | None = None
    res_by_type = inv.get("resources_by_type", {})
    if isinstance(res_by_type, dict):
        vnet_count = res_by_type.get("microsoft.network/virtualnetworks", 0)
        nsg_count = res_by_type.get("microsoft.network/networksecuritygroups", 0)
        if vnet_count > 0:
            net_score = 60.0
            net_signals.append(f"{vnet_count} virtual networks deployed.")
            if nsg_count > 0:
                net_score = 75.0
                net_signals.append(f"{nsg_count} NSGs in use.")
    sub_dims.append(_sub_dim("Network Topology", _status_from_score(net_score, good=70, warn=40), net_score, net_signals))

    # Level 5: very high tagging + policy + structured RBAC
    if maturity >= 4 and tag_score >= 90 and (compliance_rate or 0) >= 95:
        maturity = max(maturity, 5)
        signals.append("Excellent landing zone maturity — strong tagging, policy enforcement, and subscription design.")

    # --- Next level actions ---
    if maturity < 2:
        next_actions.append(_next_action("Discover and catalogue Azure subscriptions", "0 subs", "≥1 subscription", "high"))
    elif maturity < 3:
        next_actions.append(_next_action("Improve tagging compliance to ≥70%", f"{100 - untagged:.0f}%", "≥70%", "high"))
    elif maturity < 4:
        if compliance_rate is not None and compliance_rate < 90:
            next_actions.append(_next_action("Improve policy compliance to ≥90%", f"{compliance_rate:.0f}%", "≥90%", "medium"))
        else:
            next_actions.append(_next_action("Deploy Azure Policy and achieve ≥90% compliance", "No data", "≥90%", "medium"))
    elif maturity < 5:
        next_actions.append(_next_action("Achieve ≥95% policy compliance and ≥90% tagging", f"Policy: {compliance_rate or 0:.0f}%, Tags: {tag_score:.0f}%", "≥95% / ≥90%", "low"))

    return _caf_result(maturity, signals, sub_dimensions=sub_dims, next_level_actions=next_actions)


def _assess_caf_adopt(md: dict) -> dict:
    signals: list[str] = []
    maturity = 1
    sub_dims: list[dict] = []
    next_actions: list[dict] = []

    # --- Sub-dimension: Cloud Migration / Workload Deployment ---
    inv = md.get("inventory", {})
    deploy_signals: list[str] = []
    deploy_score: float | None = None
    if isinstance(inv, dict):
        total_res = inv.get("total_resource_count", 0) or inv.get("total_resources", 0) or 0
        rg_count = inv.get("resource_group_count", 0) or inv.get("total_resource_groups", 0) or 0
        if total_res > 0:
            deploy_score = min(100, total_res / 2)  # rough proxy — more resources = more adoption
            deploy_signals.append(f"{total_res} resources deployed across {rg_count} resource groups.")
    sub_dims.append(_sub_dim("Workload Deployment", _status_from_score(deploy_score, good=50, warn=20), deploy_score, deploy_signals))

    # --- Sub-dimension: D365 / SaaS Adoption ---
    platform_signals: list[str] = []
    platform_score: float | None = None
    d365 = md.get("dynamics", {})
    portfolio = md.get("portfolio", [])
    envs = 0
    if isinstance(d365, dict):
        envs = d365.get("environment_count", 0) or 0
        if envs > 0:
            maturity = max(maturity, 2)
            signals.append(f"{envs} Dynamics 365 environment(s) active.")
            platform_signals.append(f"{envs} D365 environments discovered.")
            platform_score = 55.0
        users = d365.get("active_users", 0) or 0
        if users > 0:
            platform_signals.append(f"{users} active D365 users in last 30 days.")
            platform_score = max(platform_score or 0, 75.0)
    if isinstance(portfolio, list) and portfolio:
        catalogued_apps = len([app for app in portfolio if isinstance(app, dict) and app.get("app_name")])
        if catalogued_apps > 0:
            platform_signals.append(f"{catalogued_apps} portfolio applications catalogued.")
            platform_score = max(platform_score or 0, min(100.0, 25.0 + catalogued_apps * 6.0))
            if catalogued_apps >= 5:
                maturity = max(maturity, 2)
                signals.append(f"{catalogued_apps} business applications catalogued alongside Azure estate evidence.")
    sub_dims.append(_sub_dim("Platform Adoption", _status_from_score(platform_score, good=60, warn=30), platform_score, platform_signals))

    # --- Sub-dimension: License Utilisation ---
    lic = md.get("licenses", {})
    lic_signals: list[str] = []
    lic_score: float | None = None
    if isinstance(lic, dict):
        util = lic.get("utilisation_percent", 0) or lic.get("overall_utilization_pct", 0) or 0
        if util > 0:
            lic_score = util
            lic_signals.append(f"License utilisation: {util}%.")
            if util > 80:
                maturity = max(maturity, 3)
                signals.append(f"High license utilisation ({util}%) indicates strong adoption.")
            elif util > 50:
                maturity = max(maturity, 2)
                signals.append(f"Moderate license utilisation ({util}%).")
    sub_dims.append(_sub_dim("License Utilisation", _status_from_score(lic_score, good=80, warn=50), lic_score, lic_signals))

    # --- Sub-dimension: Modernisation Signal ---
    modern_signals: list[str] = []
    modern_score: float | None = None
    portfolio = md.get("portfolio", [])
    if isinstance(portfolio, list) and portfolio:
        modernise = [a for a in portfolio if isinstance(a, dict) and str(a.get("future_state", "")).lower() in ("modernise", "modernize", "innovate")]
        if modernise:
            modern_score = round((len(modernise) / len(portfolio)) * 100, 1)
            modern_signals.append(f"{len(modernise)}/{len(portfolio)} apps targeted for modernisation/innovation.")
    sub_dims.append(_sub_dim("Modernisation", _status_from_score(modern_score, good=30, warn=10), modern_score, modern_signals))

    # Level 4: strong adoption + good utilisation
    if maturity >= 3 and (lic_score or 0) >= 80 and (deploy_score or 0) >= 50:
        maturity = max(maturity, 4)
        signals.append("Strong adoption signals — high utilisation and significant workload deployment.")

    # Level 5: all of level 4 + active modernisation
    if maturity >= 4 and (modern_score or 0) >= 30:
        maturity = max(maturity, 5)
        signals.append("Active modernisation programme alongside strong adoption metrics.")

    # --- Next level actions ---
    if maturity < 2:
        next_actions.append(_next_action("Deploy cloud workloads or configure D365 environments", "No adoption signals", "≥1 active environment", "high"))
    elif maturity < 3:
        next_actions.append(_next_action("Improve license utilisation above 80%", f"{lic_score or 0:.0f}%", "≥80%", "medium"))
    elif maturity < 4:
        next_actions.append(_next_action("Demonstrate strong adoption with ≥80% license utilisation and significant resource deployment", f"Lic: {lic_score or 0:.0f}%", "≥80% lic + deployed workloads", "medium"))
    elif maturity < 5:
        next_actions.append(_next_action("Establish modernisation pipeline — classify apps for modernisation/innovation", f"{modern_score or 0:.0f}% targeted", "≥30% targeted", "low"))

    return _caf_result(maturity, signals, sub_dimensions=sub_dims, next_level_actions=next_actions)


def _assess_caf_govern(md: dict) -> dict:
    signals: list[str] = []
    maturity = 1
    sub_dims: list[dict] = []
    next_actions: list[dict] = []
    top_recs: list[dict] = []

    inv = md.get("inventory", {})
    if not isinstance(inv, dict):
        inv = {}

    # --- Sub-dimension: Cost Management ---
    cost_signals: list[str] = []
    cost_score: float | None = None
    avg_cost_score = _advisor_category_average(md, "cost_optimization")
    if avg_cost_score is not None:
        cost_score = avg_cost_score
        cost_signals.append(f"Average Advisor cost optimisation score: {cost_score:.0f}%.")
    orphans = _extract_orphans(md)
    orphan_count = orphans.get("total_count", 0) or 0
    if orphan_count > 0:
        cost_signals.append(f"{orphan_count} orphaned resources detected (cost waste).")
        if cost_score is not None:
            cost_score = max(0, cost_score - min(20, orphan_count * 2))
    elif orphan_count == 0 and orphans:
        cost_signals.append("No orphaned resources detected \u2014 clean resource hygiene.")
        if cost_score is not None:
            cost_score = min(100, cost_score + 5)
    sub_dims.append(_sub_dim("Cost Management", _status_from_score(cost_score), cost_score, cost_signals))

    # --- Sub-dimension: Security Baseline ---
    sec_signals: list[str] = []
    sec_score: float | None = None
    defender = md.get("security", {})
    if isinstance(defender, dict):
        sec_score = defender.get("overall_percentage", 0) or 0
        if sec_score > 0:
            sec_signals.append(f"Defender secure score: {sec_score:.0f}%.")
    # Surface top at-risk controls
    controls = _extract_defender_controls(md)
    at_risk = [c for c in controls if c.get("percentage", 100) < 80 and c.get("unhealthy_count", 0) > 0]
    at_risk.sort(key=lambda c: c.get("unhealthy_count", 0), reverse=True)
    for ctrl in at_risk[:3]:
        sec_signals.append(f"\u26a0 {ctrl.get('name', 'Control')}: {ctrl.get('unhealthy_count', 0)} unhealthy resources.")
    sub_dims.append(_sub_dim("Security Baseline", _status_from_score(sec_score), sec_score, sec_signals))

    # --- Sub-dimension: Resource Consistency (Tagging) ---
    untagged = inv.get("untagged_percentage", 100)
    tag_score = max(0, 100.0 - untagged)
    tag_signals: list[str] = []
    if untagged < 20:
        maturity = max(maturity, 3)
        signals.append("Strong tagging governance in place.")
        tag_signals.append(f"{100 - untagged:.0f}% tagging compliance \u2014 strong.")
    elif untagged < 50:
        maturity = max(maturity, 2)
        signals.append("Partial tagging compliance \u2014 governance policies may need enforcement.")
        tag_signals.append(f"{100 - untagged:.0f}% tagging compliance \u2014 needs improvement.")
    else:
        tag_signals.append(f"Only {100 - untagged:.0f}% tagged \u2014 significant gap.")
    sub_dims.append(_sub_dim("Resource Consistency", _status_from_score(tag_score, good=80, warn=50), tag_score, tag_signals))

    # --- Sub-dimension: Identity Baseline (RBAC) ---
    rbac = _extract_rbac(md)
    rbac_signals: list[str] = []
    rbac_score: float | None = None
    total_assignments = rbac.get("total_count", 0) or 0
    owner_count = rbac.get("owner_count", 0) or 0
    contributor_count = rbac.get("contributor_count", 0) or 0
    sub_count = inv.get("subscription_count", 0) or inv.get("total_subscriptions", 0) or 0
    if sub_count > 1:
        signals.append(f"Multi-subscription environment ({sub_count}) \u2014 management group structure recommended.")
    if total_assignments > 0:
        rbac_signals.append(f"{total_assignments} role assignments across {rbac.get('subscription_count', 0)} subscriptions.")
        owner_ratio = owner_count / max(sub_count, 1)
        if owner_ratio <= 3:
            rbac_score = 90.0
            rbac_signals.append(f"Good least-privilege posture \u2014 {owner_count} Owner assignments (~{owner_ratio:.1f}/sub).")
        elif owner_ratio <= 6:
            rbac_score = 65.0
            rbac_signals.append(f"Moderate Owner count \u2014 {owner_count} Owners (~{owner_ratio:.1f}/sub). Consider reducing.")
        else:
            rbac_score = 35.0
            rbac_signals.append(f"High Owner count \u2014 {owner_count} Owners (~{owner_ratio:.1f}/sub). Least-privilege review needed.")
        by_type = rbac.get("by_principal_type", {})
        sp_count = by_type.get("ServicePrincipal", 0)
        user_count = by_type.get("User", 0)
        if sp_count > 0 and user_count > 0:
            rbac_signals.append(f"{sp_count} service principals, {user_count} user assignments.")
    sub_dims.append(_sub_dim("Identity Baseline", _status_from_score(rbac_score, good=80, warn=50), rbac_score, rbac_signals))

    # --- Sub-dimension: Policy Enforcement ---
    policy = _extract_policy_compliance(md)
    policy_signals: list[str] = []
    compliance_rate = _policy_compliance_rate(policy)
    if compliance_rate is not None:
        policy_signals.append(f"Policy compliance rate: {compliance_rate:.0f}%.")
        non_comp_policies = policy.get("total_non_compliant_policies", 0)
        non_comp_resources = policy.get("total_non_compliant_resources", 0)
        total_assignments_p = policy.get("total_policy_assignments", 0)
        if total_assignments_p > 0:
            policy_signals.append(f"{total_assignments_p} policy assignments enforced.")
        if non_comp_resources > 0:
            policy_signals.append(f"{non_comp_resources} non-compliant resources across {non_comp_policies} policies.")
        for sub_data in policy.get("by_subscription", []):
            for top_nc in (sub_data.get("top_non_compliant") or [])[:2]:
                name = top_nc.get("policy_name", "Unknown")
                nc_count = top_nc.get("non_compliant_resources", 0)
                if nc_count > 0:
                    policy_signals.append(f"\u26a0 '{name}': {nc_count} non-compliant resources.")
        if compliance_rate >= 90:
            maturity = max(maturity, 4)
            signals.append(f"Strong policy enforcement \u2014 {compliance_rate:.0f}% compliance rate.")
        elif compliance_rate >= 70:
            maturity = max(maturity, 3)
            signals.append(f"Moderate policy compliance ({compliance_rate:.0f}%).")
        elif compliance_rate >= 40:
            maturity = max(maturity, 2)
            signals.append(f"Low policy compliance ({compliance_rate:.0f}%) \u2014 enforcement gaps.")
    sub_dims.append(_sub_dim("Policy Enforcement", _status_from_score(compliance_rate, good=85, warn=60), compliance_rate, policy_signals))

    avg_oe_score = _advisor_category_average(md, "operational_excellence")
    if avg_oe_score is not None:
        if avg_oe_score > 80:
            maturity = max(maturity, 3)
        signals.append(f"Average Advisor OE score ({avg_oe_score:.0f}%) used as an operational governance proxy.")

    # Surface relevant advisor recs for governance
    for rec in _extract_advisor_recs(md):
        cat = rec.get("category", "").lower()
        if cat in ("cost", "operationalexcellence", "operational excellence") and rec.get("impact") in ("High", "Medium"):
            top_recs.append({"source": "Advisor", "category": rec.get("category", ""), "impact": rec.get("impact", ""), "description": rec.get("short_description") or rec.get("description", "")})
            if len(top_recs) >= 5:
                break

    # Level 5: excellent across all sub-dimensions
    if maturity >= 4 and (compliance_rate or 0) >= 95 and tag_score >= 85 and (rbac_score or 0) >= 80 and orphan_count == 0:
        maturity = max(maturity, 5)
        signals.append("Excellent governance maturity \u2014 strong policy, RBAC, tagging, and zero orphaned resources.")

    # --- Next level actions ---
    if maturity < 2:
        next_actions.append(_next_action("Establish basic tagging standards and apply to \u226550% of resources", f"{100 - untagged:.0f}% tagged", "\u226550%", "high"))
    elif maturity < 3:
        if (compliance_rate or 0) < 70:
            next_actions.append(_next_action("Deploy Azure Policy and achieve \u226570% compliance", f"{compliance_rate or 0:.0f}%" if compliance_rate else "No data", "\u226570%", "high"))
        else:
            next_actions.append(_next_action("Improve tagging to \u226580% and reduce Owner assignments", f"{100 - untagged:.0f}% tagged, {owner_count} Owners", "\u226580% tagged, \u22643/sub Owners", "medium"))
    elif maturity < 4:
        next_actions.append(_next_action("Achieve \u226590% policy compliance rate", f"{compliance_rate or 0:.0f}%", "\u226590%", "medium"))
        if orphan_count > 0:
            next_actions.append(_next_action(f"Clean up {orphan_count} orphaned resources", f"{orphan_count} orphans", "0", "medium"))
    elif maturity < 5:
        next_actions.append(_next_action("Achieve \u226595% policy compliance, \u226585% tagging, zero orphans", f"Policy: {compliance_rate or 0:.0f}%, Tags: {tag_score:.0f}%, Orphans: {orphan_count}", "\u226595% / \u226585% / 0", "low"))
        if (rbac_score or 0) < 80:
            next_actions.append(_next_action("Reduce Owner role assignments to \u22643 per subscription", f"{owner_count} Owners", "\u22643/sub", "medium"))

    return _caf_result(maturity, signals, sub_dimensions=sub_dims, next_level_actions=next_actions, top_recommendations=top_recs)


def _assess_caf_secure(md: dict) -> dict:
    signals: list[str] = []
    maturity = 1
    sub_dims: list[dict] = []
    next_actions: list[dict] = []
    top_ctrls: list[dict] = []
    top_recs: list[dict] = []

    defender = md.get("security", {})
    pct = 0
    if isinstance(defender, dict):
        pct = defender.get("overall_percentage", 0) or 0
    elif isinstance(defender, list) and defender:
        pct = sum(d.get("percentage", 0) for d in defender) / len(defender)

    # --- Sub-dimension: Risk Insights (Defender Score) ---
    risk_signals: list[str] = []
    if pct >= 80:
        maturity = max(maturity, 4)
        signals.append(f"Strong Defender secure score ({pct:.0f}%).")
        risk_signals.append(f"Secure score: {pct:.0f}% \u2014 strong posture.")
    elif pct >= 60:
        maturity = max(maturity, 3)
        signals.append(f"Moderate secure score ({pct:.0f}%) \u2014 improvement opportunities exist.")
        risk_signals.append(f"Secure score: {pct:.0f}% \u2014 moderate.")
    elif pct >= 40:
        maturity = max(maturity, 2)
        signals.append(f"Below-average secure score ({pct:.0f}%) \u2014 security uplift needed.")
        risk_signals.append(f"Secure score: {pct:.0f}% \u2014 below average.")
    elif pct > 0:
        signals.append(f"Low secure score ({pct:.0f}%) \u2014 significant security risk.")
        risk_signals.append(f"Secure score: {pct:.0f}% \u2014 critical risk.")
    sub_dims.append(_sub_dim("Risk Insights", _status_from_score(pct if pct > 0 else None), pct if pct > 0 else None, risk_signals))

    # --- Sub-dimension: Asset Protection (Defender Controls) ---
    controls = _extract_defender_controls(md)
    asset_signals: list[str] = []
    asset_score: float | None = None
    if controls:
        total_healthy = sum(c.get("healthy_count", 0) for c in controls)
        total_unhealthy = sum(c.get("unhealthy_count", 0) for c in controls)
        total_assessed = total_healthy + total_unhealthy
        if total_assessed > 0:
            asset_score = round((total_healthy / total_assessed) * 100, 1)
            asset_signals.append(f"{total_healthy}/{total_assessed} resources healthy across {len(controls)} controls.")
        at_risk = [c for c in controls if c.get("percentage", 100) < 80 and c.get("unhealthy_count", 0) > 0]
        at_risk.sort(key=lambda c: c.get("unhealthy_count", 0), reverse=True)
        for ctrl in at_risk[:5]:
            ctrl_name = ctrl.get("name", "Control")
            ctrl_unhealthy = ctrl.get("unhealthy_count", 0)
            ctrl_pct = ctrl.get("percentage", 0)
            asset_signals.append(f"\u26a0 {ctrl_name}: {ctrl_unhealthy} unhealthy ({ctrl_pct:.0f}% healthy).")
            top_ctrls.append({"name": ctrl_name, "unhealthy_count": ctrl_unhealthy, "percentage": ctrl_pct, "healthy_count": ctrl.get("healthy_count", 0)})
    sub_dims.append(_sub_dim("Asset Protection", _status_from_score(asset_score, good=85, warn=60), asset_score, asset_signals))

    # --- Sub-dimension: Security Governance (Policy + RBAC) ---
    sec_gov_signals: list[str] = []
    sec_gov_score: float | None = None
    rbac = _extract_rbac(md)
    owner_count = rbac.get("owner_count", 0) or 0
    sub_count = (md.get("inventory", {}) or {}).get("subscription_count", 0) or (md.get("inventory", {}) or {}).get("total_subscriptions", 0) or 0
    if owner_count > 0 and sub_count > 0:
        owner_ratio = owner_count / max(sub_count, 1)
        if owner_ratio <= 3:
            sec_gov_score = 85.0
            sec_gov_signals.append(f"Least-privilege: {owner_count} Owners across {sub_count} subs (~{owner_ratio:.1f}/sub).")
        elif owner_ratio <= 6:
            sec_gov_score = 55.0
            sec_gov_signals.append(f"Moderate Owner count: {owner_count} (~{owner_ratio:.1f}/sub).")
        else:
            sec_gov_score = 25.0
            sec_gov_signals.append(f"Excessive Owner count: {owner_count} (~{owner_ratio:.1f}/sub) \u2014 high-risk.")
    # Policy signal
    policy = _extract_policy_compliance(md)
    compliance_rate = _policy_compliance_rate(policy)
    if compliance_rate is not None:
        sec_gov_signals.append(f"Policy compliance: {compliance_rate:.0f}%.")
        if sec_gov_score is not None:
            sec_gov_score = round((sec_gov_score + compliance_rate) / 2, 1)
        else:
            sec_gov_score = compliance_rate
    sub_dims.append(_sub_dim("Security Governance", _status_from_score(sec_gov_score, good=80, warn=50), sec_gov_score, sec_gov_signals))

    # --- Sub-dimension: Innovation Security (Advisor Sec Recs) ---
    innov_signals: list[str] = []
    innov_score: float | None = None
    sec_recs = [r for r in _extract_advisor_recs(md) if r.get("category", "").lower() == "security"]
    high_impact_sec = [r for r in sec_recs if r.get("impact") == "High"]
    if sec_recs:
        innov_score = max(0, 100 - len(high_impact_sec) * 10)
        innov_signals.append(f"{len(sec_recs)} security recommendations ({len(high_impact_sec)} high-impact).")
        for r in high_impact_sec[:3]:
            desc = r.get("short_description") or r.get("description", "")
            innov_signals.append(f"\u26a0 High: {desc}")
            top_recs.append({"source": "Advisor", "category": "Security", "impact": "High", "description": desc})
    sub_dims.append(_sub_dim("Innovation Security", _status_from_score(innov_score, good=80, warn=50), innov_score, innov_signals))

    # Level 5: Defender ≥90%, no high-impact sec recs, good RBAC
    if maturity >= 4 and pct >= 90 and len(high_impact_sec) == 0 and (sec_gov_score or 0) >= 80:
        maturity = max(maturity, 5)
        signals.append("Excellent security maturity \u2014 high Defender score, zero critical gaps, strong governance.")

    # --- Next level actions ---
    if maturity < 2:
        next_actions.append(_next_action("Enable Defender for Cloud and achieve \u226540% secure score", f"{pct:.0f}%", "\u226540%", "high"))
    elif maturity < 3:
        next_actions.append(_next_action("Improve Defender secure score to \u226560%", f"{pct:.0f}%", "\u226560%", "high"))
    elif maturity < 4:
        next_actions.append(_next_action("Achieve \u226580% Defender secure score", f"{pct:.0f}%", "\u226580%", "medium"))
        if high_impact_sec:
            next_actions.append(_next_action(f"Resolve {len(high_impact_sec)} high-impact security recommendations", f"{len(high_impact_sec)} open", "0", "high"))
    elif maturity < 5:
        next_actions.append(_next_action("Achieve \u226590% Defender score and resolve all high-impact recommendations", f"Score: {pct:.0f}%, High recs: {len(high_impact_sec)}", "\u226590% / 0 high recs", "low"))

    return _caf_result(maturity, signals, sub_dimensions=sub_dims, next_level_actions=next_actions, top_recommendations=top_recs, top_controls=top_ctrls)


def _assess_caf_manage(md: dict) -> dict:
    signals: list[str] = []
    maturity = 1
    sub_dims: list[dict] = []
    next_actions: list[dict] = []
    top_recs: list[dict] = []

    # --- Sub-dimension: Integration Health ---
    integ = md.get("integrations", {})
    integ_signals: list[str] = []
    integ_score: float | None = None
    total_integ = 0
    degraded_integ = 0
    if isinstance(integ, dict):
        total_integ = integ.get("total_count", 0) or integ.get("total_integrations", 0) or 0
        if total_integ > 0:
            maturity = max(maturity, 2)
            signals.append(f"{total_integ} integrations discovered and mapped.")
            integ_signals.append(f"{total_integ} integrations catalogued.")
            has_health_metrics = any(
                key in integ for key in ("degraded_count", "failing_count", "degraded", "failing", "healthy")
            )
            if has_health_metrics:
                degraded_integ = (integ.get("degraded_count", 0) or integ.get("degraded", 0) or 0) + (
                    integ.get("failing_count", 0) or integ.get("failing", 0) or 0
                )
                integ_score = round(((total_integ - degraded_integ) / total_integ) * 100, 1)
                if degraded_integ == 0:
                    maturity = max(maturity, 3)
                    signals.append("Integration health telemetry reports no degraded/failing connections.")
                    integ_signals.append("All integrations healthy.")
                else:
                    signals.append(f"{degraded_integ} integrations in degraded/failing state.")
                    integ_signals.append(f"{degraded_integ}/{total_integ} degraded or failing.")
            else:
                integ_signals.append("Health telemetry not currently measured.")
    sub_dims.append(_sub_dim("Integration Health", _status_from_score(integ_score, good=90, warn=70), integ_score, integ_signals))

    # --- Sub-dimension: Workflow Management ---
    wf_signals: list[str] = []
    wf_score: float | None = None
    d365 = md.get("dynamics", {})
    if isinstance(d365, dict):
        wf = d365.get("workflows", {})
        if isinstance(wf, dict) and wf.get("total_count", 0):
            wf_total = wf.get("total_count", 0) or 0
            wf_inactive = wf.get("inactive_count", 0) or 0
            wf_score = round(((wf_total - wf_inactive) / wf_total) * 100, 1) if wf_total > 0 else None
            signals.append(f"{wf_total} D365 workflows tracked.")
            wf_signals.append(f"{wf_total} workflows ({wf_total - wf_inactive} active, {wf_inactive} inactive).")
            if wf_inactive > wf_total * 0.3:
                wf_signals.append(f"High inactive rate ({wf_inactive}/{wf_total}) \u2014 operational debt.")
    sub_dims.append(_sub_dim("Workflow Management", _status_from_score(wf_score, good=80, warn=60), wf_score, wf_signals))

    # --- Sub-dimension: Operational Hygiene (orphaned resources) ---
    orphans = _extract_orphans(md)
    orphan_count = orphans.get("total_count", 0) or 0
    hygiene_signals: list[str] = []
    hygiene_score: float | None = None
    if orphans:
        by_type = orphans.get("by_type", {})
        if orphan_count == 0:
            hygiene_score = 100.0
            hygiene_signals.append("No orphaned resources \u2014 excellent operational hygiene.")
        else:
            # Cap penalty at 0
            inv = md.get("inventory", {}) if isinstance(md.get("inventory"), dict) else {}
            total_resources = inv.get("total_resource_count", 0) or inv.get("total_resources", 0) or 100
            hygiene_score = max(0, round(100 - (orphan_count / max(total_resources, 1)) * 100, 1))
            hygiene_signals.append(f"{orphan_count} orphaned resources detected.")
            for cat, count in sorted(by_type.items(), key=lambda x: x[1], reverse=True):
                if count > 0:
                    hygiene_signals.append(f"  {cat.replace('_', ' ').title()}: {count}")
    sub_dims.append(_sub_dim("Operational Hygiene", _status_from_score(hygiene_score, good=90, warn=70), hygiene_score, hygiene_signals))

    # --- Sub-dimension: Monitoring Coverage (Advisor OE as proxy) ---
    monitor_signals: list[str] = []
    monitor_score: float | None = None
    avg_oe_score = _advisor_category_average(md, "operational_excellence")
    if avg_oe_score is not None:
        monitor_score = avg_oe_score
        monitor_signals.append(f"Average Advisor Operational Excellence score: {monitor_score:.0f}%.")
    sub_dims.append(_sub_dim("Monitoring Coverage", _status_from_score(monitor_score), monitor_score, monitor_signals))

    # Surface relevant advisor recs
    for rec in _extract_advisor_recs(md):
        cat = rec.get("category", "").lower()
        if cat in ("operationalexcellence", "operational excellence", "reliability") and rec.get("impact") in ("High", "Medium"):
            top_recs.append({"source": "Advisor", "category": rec.get("category", ""), "impact": rec.get("impact", ""), "description": rec.get("short_description") or rec.get("description", "")})
            if len(top_recs) >= 5:
                break

    # Level 4: healthy integrations + good monitoring + low orphans
    if maturity >= 3 and (integ_score or 0) >= 90 and (monitor_score or 0) >= 70 and orphan_count <= 5:
        maturity = max(maturity, 4)
        signals.append("Strong operational management \u2014 healthy integrations, good monitoring, clean resources.")

    # Level 5: all healthy + zero orphans + workflow management
    if maturity >= 4 and (integ_score or 0) >= 95 and orphan_count == 0 and (wf_score or 0) >= 90:
        maturity = max(maturity, 5)
        signals.append("Excellent management maturity \u2014 all integrations healthy, zero orphans, active workflow management.")

    # --- Next level actions ---
    if maturity < 2:
        next_actions.append(_next_action("Discover and catalogue integrations", "0 integrations", "\u22651 mapped", "high"))
    elif maturity < 3:
        if degraded_integ > 0:
            next_actions.append(_next_action(f"Resolve {degraded_integ} degraded/failing integrations", f"{degraded_integ} unhealthy", "0 degraded", "high"))
        else:
            next_actions.append(_next_action("Enable integration health monitoring", "No health data", "Health telemetry active", "medium"))
    elif maturity < 4:
        next_actions.append(_next_action("Achieve \u226590% integration health and clean up orphaned resources", f"Health: {integ_score or 0:.0f}%, Orphans: {orphan_count}", "\u226590% / \u22645 orphans", "medium"))
    elif maturity < 5:
        next_actions.append(_next_action("Achieve perfect integration health, zero orphans, and \u226590% workflow activity", f"Health: {integ_score or 0:.0f}%, Orphans: {orphan_count}", "100% / 0 / \u226590%", "low"))

    return _caf_result(maturity, signals, sub_dimensions=sub_dims, next_level_actions=next_actions, top_recommendations=top_recs)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_WAF_SCORERS = {
    "reliability": _score_reliability,
    "security": _score_security,
    "cost_optimization": _score_cost_optimization,
    "operational_excellence": _score_operational_excellence,
    "performance_efficiency": _score_performance_efficiency,
}

_CAF_ASSESSORS = {
    "strategy": _assess_caf_strategy,
    "plan": _assess_caf_plan,
    "ready": _assess_caf_ready,
    "adopt": _assess_caf_adopt,
    "govern": _assess_caf_govern,
    "secure": _assess_caf_secure,
    "manage": _assess_caf_manage,
}


def _build_priority_actions(waf_results: dict[str, dict], data_gaps: list[dict]) -> list[dict]:
    actions: list[dict] = []

    low_scored = sorted(
        [p for p in waf_results.values() if p.get("has_data")],
        key=lambda item: float(item.get("score", 0)),
    )
    for pillar in low_scored:
        score = float(pillar.get("score", 0))
        if score >= 75:
            continue
        phase2 = pillar.get("phase2_opportunities") or []
        top_opp = phase2[0] if isinstance(phase2, list) and phase2 else None
        actions.append(
            {
                "title": f"Improve {pillar.get('name', 'pillar')} posture",
                "priority": "high" if score < 50 else "medium",
                "rationale": f"Current measured score is {score:.1f}%.",
                "recommended_action": (
                    top_opp.get("title")
                    if isinstance(top_opp, dict) and top_opp.get("title")
                    else "Review detailed findings and create a remediation backlog."
                ),
                "reference": (
                    top_opp.get("ref")
                    if isinstance(top_opp, dict) and top_opp.get("ref")
                    else pillar.get("checklist_range", "")
                ),
            }
        )
        if len(actions) >= 3:
            break

    for gap in data_gaps:
        if not isinstance(gap, dict):
            continue
        severity = str(gap.get("severity", "")).lower()
        if severity not in {"high", "critical"}:
            continue
        module = str(gap.get("module", "Module"))
        field = str(gap.get("field", "data"))
        remediation = str(gap.get("remediation") or "Re-run pull data after verifying permissions.")
        actions.append(
            {
                "title": f"Restore {module} telemetry",
                "priority": "high",
                "rationale": f"Missing or failed {module}.{field} limits scoring confidence.",
                "recommended_action": remediation,
                "reference": "Data quality",
            }
        )
        if len(actions) >= 6:
            break

    if actions:
        return actions

    unscored = [p for p in waf_results.values() if not p.get("has_data")]
    if unscored:
        for pillar in unscored[:3]:
            actions.append(
                {
                    "title": f"Collect telemetry for {pillar.get('name', 'pillar')}",
                    "priority": "medium",
                    "rationale": "No measurable data mapped to this pillar in the current pull.",
                    "recommended_action": "Complete pull-data for Security, Inventory, Costs, Integrations, and Dynamics.",
                    "reference": pillar.get("checklist_range", ""),
                }
            )
    return actions


def generate_framework_assessment(module_data: dict[str, Any]) -> dict:
    """Run WAF and CAF assessments against collected module data.

    Args:
        module_data: Dict with keys like ``costs``, ``security``, ``licenses``,
                     ``integrations``, ``inventory``, ``dynamics``, ``data_gaps``,
                     ``advisor_scores``, ``advisor_recommendations``, ``portfolio``,
                     ``initiatives``.

    Returns:
        Dict with ``waf_pillars``, ``caf_methodologies``, and ``phase2_summary``.
    """
    # --- WAF ---
    waf_results: dict[str, dict] = {}
    all_phase2: list[dict] = []

    for key, scorer in _WAF_SCORERS.items():
        meta = WAF_PILLARS[key]
        try:
            result = scorer(module_data)
            waf_results[key] = {**meta, **result}
            for opp in result.get("phase2_opportunities", []):
                all_phase2.append({**opp, "pillar": meta["name"]})
        except Exception as exc:
            logger.warning("WAF scorer %s failed: %s", key, exc)
            waf_results[key] = {
                **meta,
                "score": 0,
                "has_data": False,
                "findings": [],
                "evidence_count": 0,
                "phase2_opportunities": [],
            }

    pillar_scores = [float(p["score"]) for p in waf_results.values() if p.get("has_data")]
    overall_waf = round(sum(pillar_scores) / len(pillar_scores), 1) if pillar_scores else 0
    scored_pillars_count = sum(1 for p in waf_results.values() if p.get("has_data"))

    # --- CAF ---
    caf_results: dict[str, dict] = {}
    for key, assessor in _CAF_ASSESSORS.items():
        meta = CAF_METHODOLOGIES[key]
        try:
            result = assessor(module_data)
            caf_results[key] = {**meta, **result}
        except Exception as exc:
            logger.warning("CAF assessor %s failed: %s", key, exc)
            caf_results[key] = {**meta, "maturity": 0, "maturity_label": "Not Assessed", "signals": [], "has_signals": False}

    mat_values = [int(c["maturity"]) for c in caf_results.values() if c.get("has_signals")]
    avg_maturity = round(sum(mat_values) / len(mat_values), 1) if mat_values else 0
    data_gaps = module_data.get("data_gaps", [])
    if not isinstance(data_gaps, list):
        data_gaps = []
    priority_actions = _build_priority_actions(waf_results, data_gaps)

    return {
        "waf_pillars": waf_results,
        "waf_overall_score": overall_waf,
        "scored_pillars_count": scored_pillars_count,
        "total_pillars": len(waf_results),
        "caf_methodologies": caf_results,
        "caf_average_maturity": avg_maturity,
        "phase2_summary": all_phase2,
        "phase2_count": len(all_phase2),
        "priority_actions": priority_actions,
        "data_gaps": data_gaps,
        "assessment_scope": "Discovery & Assessment (High level posture based on available reporting)",
    }


# Demo data removed — all data now sourced from live Azure APIs.
