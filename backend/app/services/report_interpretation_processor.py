"""Assessment Report V2 interpretation generation."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

SECTION_KEYS = [
    "executive_summary",
    "business_context",
    "estate_interpretation",
    "security_interpretation",
    "governance_interpretation",
    "cost_interpretation",
    "recommendation_context",
    "leadership_takeaways",
]


def interpretation_processing_enabled() -> bool:
    return bool(settings.openai_api_key.strip())


def _extract_output_text(payload: dict[str, Any]) -> str:
    output = payload.get("output") or []
    for item in output:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") == "output_text":
                return content.get("text") or ""
    return ""


def _first_sentence(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    for separator in (". ", "!\n", "? ", "\n"):
        if separator in text:
            return text.split(separator, 1)[0].strip().rstrip(".!?") + "."
    return text


def _top_titles(items: list[dict[str, Any]], key: str, limit: int = 3) -> list[str]:
    result: list[str] = []
    for item in items[:limit]:
        value = str(item.get(key) or "").strip()
        if value:
            result.append(value)
    return result


def build_local_interpretation(bundle: dict[str, Any]) -> dict[str, Any]:
    profile = bundle["profile"]
    org = bundle.get("organization_context") or {}
    evidence = bundle["evidence"]
    manual = bundle["manual_context"]

    inventory = evidence.get("inventory_summary") or {}
    cost = evidence.get("cost_summary") or {}
    framework = evidence.get("framework_insights") or {}
    defender = evidence.get("defender_scores") or {}

    total_resources = int(inventory.get("total_resources") or 0)
    total_groups = int(inventory.get("total_resource_groups") or 0)
    total_subscriptions = int(inventory.get("total_subscriptions") or 0)
    monthly_cost = float(cost.get("total") or cost.get("total_cost_1m") or 0)
    secure_score = float(defender.get("overall_percentage") or 0)
    caf_maturity = float(framework.get("caf_average_maturity") or 0)
    rec_count = len(manual.get("recommendations") or [])
    challenge_count = len(manual.get("challenges") or [])
    initiative_count = len(manual.get("initiatives") or [])

    org_overview = _first_sentence(org.get("organisation_overview"))
    scope = _first_sentence(org.get("assessment_scope_notes")) or "Assessment scope should be reviewed in the profile context."
    leadership = _first_sentence(org.get("leadership_context_notes")) or "Leadership context has not yet been explicitly refined for this profile."
    top_recommendations = _top_titles(manual.get("recommendations") or [], "title")
    top_challenges = _top_titles(manual.get("challenges") or [], "title")
    top_initiatives = _top_titles(manual.get("initiatives") or [], "name")

    executive_summary = (
        f"{profile['customer_name']} now has a V2 assessment report grounded in the saved profile snapshot dated "
        f"{bundle.get('snapshot_at') or 'the current assessment snapshot'}. "
        f"The current evidence shows {total_resources} resources across {total_groups} resource groups and "
        f"{total_subscriptions} subscriptions, with approximately ${monthly_cost:,.0f} of last-month spend captured in the snapshot. "
        f"The report should be read as a profile-specific baseline rather than a fixed template narrative."
    )
    business_context = " ".join(
        part for part in [
            org_overview,
            scope,
            leadership,
        ] if part
    ) or "Organisation context has not yet been expanded beyond the stored profile basics."
    estate_interpretation = (
        f"The estate evidence suggests a footprint of {total_resources} discovered resources across {total_groups} resource groups. "
        "This matters because the operating overhead, support shape, and change coordination burden are influenced by the breadth of the deployed estate. "
        f"Where the profile still has only limited manually curated context, the next step is to validate whether this footprint matches the organisation's intended operating model."
    )
    security_interpretation = (
        f"The current security posture is anchored by an overall secure score of {secure_score:.1f}%. "
        "That score should not be treated in isolation; it is a prioritisation signal that should be read alongside the stored challenge and recommendation records for this profile. "
        "The main question is not only whether risks exist, but whether there is enough delivery capacity and ownership clarity to reduce them consistently."
    )
    governance_interpretation = (
        f"The saved framework evidence indicates an average CAF maturity of {caf_maturity:.1f}. "
        "That maturity signal should be interpreted as a capability baseline, not a final verdict. "
        "It is most useful when connected back to the organisation context, governance habits, and the quality of ongoing change management visible in the profile records."
    )
    cost_interpretation = (
        f"The current monthly spend baseline in the snapshot is approximately ${monthly_cost:,.0f}. "
        "Cost interpretation should stay linked to what the estate is supporting and whether the organisation is intentionally funding complexity, duplication, or transitional workload patterns. "
        "Spend alone does not determine value; the relevant question is what that spend says about operational shape and improvement opportunity."
    )
    recommendation_context = (
        f"The profile currently contains {rec_count} recommendations, {challenge_count} challenges, and {initiative_count} initiatives. "
        + (
            f"Priority recommendations already captured include {', '.join(top_recommendations)}. "
            if top_recommendations
            else ""
        )
        + (
            f"Current challenge framing includes {', '.join(top_challenges)}. "
            if top_challenges
            else ""
        )
        + (
            f"Existing initiative planning includes {', '.join(top_initiatives)}."
            if top_initiatives
            else ""
        )
    ).strip()
    leadership_takeaways = (
        "Leadership should treat this V2 report as an evidence-backed interpretation layer for the active profile. "
        "The golden evidence remains in the stored snapshot modules; the interpretation text explains why that evidence matters in business terms and should be reviewed, edited, and approved before distribution."
    )

    sections = {
        "executive_summary": executive_summary,
        "business_context": business_context,
        "estate_interpretation": estate_interpretation,
        "security_interpretation": security_interpretation,
        "governance_interpretation": governance_interpretation,
        "cost_interpretation": cost_interpretation,
        "recommendation_context": recommendation_context,
        "leadership_takeaways": leadership_takeaways,
    }

    return {
        "sections": [{"section_key": key, "text": sections[key]} for key in SECTION_KEYS],
        "generation_notes": (
            "Generated from saved profile evidence using the local fallback interpretation scaffold."
        ),
        "generation_model": "local-fallback",
    }


async def process_report_interpretation(bundle: dict[str, Any]) -> dict[str, Any]:
    """Generate grounded interpretation text for Report V2.

    Falls back to a deterministic local scaffold when OpenAI is not configured.
    """

    if not interpretation_processing_enabled():
        return build_local_interpretation(bundle)

    system_prompt = (
        "You are the Assessment Report V2 interpretation engine for a profile-scoped Azure assessment platform. "
        "Use only the provided grounding bundle. Do not invent evidence, customer history, numbers, or recommendations that are not supported by the bundle. "
        "Keep golden evidence separate from interpretation: explain why the evidence matters in business and delivery terms, but do not rewrite the evidence itself. "
        "If evidence is missing, say so plainly. Return concise, executive-ready text for each requested section."
    )

    user_prompt = (
        "Grounding bundle for one customer profile assessment report.\n\n"
        f"{json.dumps(bundle, ensure_ascii=True)}"
    )

    schema = {
        "type": "object",
        "properties": {
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "section_key": {"type": "string", "enum": SECTION_KEYS},
                        "text": {"type": "string"},
                    },
                    "required": ["section_key", "text"],
                    "additionalProperties": False,
                },
            },
            "generation_notes": {"type": "string"},
            "generation_model": {"type": "string"},
        },
        "required": ["sections", "generation_notes", "generation_model"],
        "additionalProperties": False,
    }

    request_body = {
        "model": settings.openai_model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "report_interpretation_result",
                "schema": schema,
                "description": "Grounded section outputs for one profile-scoped report interpretation run.",
                "strict": True,
            }
        },
    }

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(OPENAI_RESPONSES_URL, headers=headers, json=request_body)
    except httpx.HTTPError as exc:
        return {
            **build_local_interpretation(bundle),
            "generation_notes": f"OpenAI interpretation request failed; local scaffold used instead ({exc.__class__.__name__}).",
            "generation_model": "local-fallback",
        }

    if response.status_code >= 400:
        return {
            **build_local_interpretation(bundle),
            "generation_notes": f"OpenAI interpretation failed; fell back to local scaffold ({response.status_code}).",
            "generation_model": "local-fallback",
        }

    try:
        payload = response.json()
    except ValueError:
        return {
            **build_local_interpretation(bundle),
            "generation_notes": "OpenAI interpretation returned a non-JSON response; local scaffold used instead.",
            "generation_model": "local-fallback",
        }
    text = _extract_output_text(payload).strip()
    if not text:
        return {
            **build_local_interpretation(bundle),
            "generation_notes": "OpenAI interpretation returned no output text; local scaffold used instead.",
            "generation_model": "local-fallback",
        }

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {
            **build_local_interpretation(bundle),
            "generation_notes": "OpenAI interpretation returned invalid JSON; local scaffold used instead.",
            "generation_model": "local-fallback",
        }

    sections = parsed.get("sections") or []
    section_map = {
        str(item.get("section_key")): str(item.get("text") or "").strip()
        for item in sections
        if str(item.get("section_key") or "").strip()
    }

    normalized_sections = [
        {"section_key": key, "text": section_map.get(key) or build_local_interpretation(bundle)["sections"][SECTION_KEYS.index(key)]["text"]}
        for key in SECTION_KEYS
    ]

    return {
        "sections": normalized_sections,
        "generation_notes": str(parsed.get("generation_notes") or "Generated via OpenAI Responses API."),
        "generation_model": str(parsed.get("generation_model") or settings.openai_model),
    }
