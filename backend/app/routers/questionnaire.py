"""Questionnaire router — serves WAF assessment questions and accepts answers.

Endpoints:
  GET  /api/questionnaire/pillars   — list of available pillars
  GET  /api/questionnaire/questions  — questions for selected pillars
  POST /api/questionnaire/submit     — submit assessment answers
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/questionnaire", tags=["questionnaire"])

# ---------------------------------------------------------------------------
# Load WAF questions from bundled JSON (once at import time)
# ---------------------------------------------------------------------------

_DATA: dict[str, Any] = {}

_JSON_PATH = Path(__file__).resolve().parent.parent / "services" / "starter_questions.json"

def _load_data() -> dict[str, Any]:
    global _DATA
    if not _DATA:
        with open(_JSON_PATH, "r", encoding="utf-8") as f:
            _DATA = json.load(f)
    return _DATA


# The 5 core WAF pillar titles we expose
CORE_PILLAR_TITLES = [
    "Reliability",
    "Security",
    "Cost Optimization",
    "Operational Excellence",
    "Performance Efficiency",
]


def _get_pillars() -> list[dict[str, Any]]:
    """Return the 5 core WAF pillar categories with metadata."""
    data = _load_data()
    pillars = []
    for cat in data.get("categories", []):
        title = cat.get("title", "").strip()
        if title in CORE_PILLAR_TITLES:
            pillars.append({
                "id": cat["id"],
                "title": title,
                "description": cat.get("description", ""),
                "question_count": len(cat.get("questions", [])),
            })
    # Ensure consistent ordering
    order = {t: i for i, t in enumerate(CORE_PILLAR_TITLES)}
    pillars.sort(key=lambda p: order.get(p["title"], 99))
    return pillars


def _get_questions_for_pillars(pillar_ids: list[str]) -> list[dict[str, Any]]:
    """Return questions grouped by pillar for the requested pillar ids."""
    data = _load_data()
    result = []
    for cat in data.get("categories", []):
        if cat["id"] in pillar_ids:
            questions = []
            for q in cat.get("questions", []):
                choices = []
                for c in q.get("choices", []):
                    choices.append({
                        "id": c["id"],
                        "text": c["text"],
                        "description": c.get("description", ""),
                    })
                questions.append({
                    "id": q["id"],
                    "type": q.get("type", "multiSelect"),
                    "title": q["title"],
                    "description": q.get("description", ""),
                    "is_required": q.get("isRequired", False),
                    "choices": choices,
                })
            result.append({
                "pillar_id": cat["id"],
                "pillar_title": cat["title"].strip(),
                "questions": questions,
            })
    # Maintain consistent ordering
    order = {t: i for i, t in enumerate(CORE_PILLAR_TITLES)}
    result.sort(key=lambda p: order.get(p["pillar_title"], 99))
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/pillars")
async def list_pillars():
    """Return available WAF pillars with question counts."""
    return {"pillars": _get_pillars()}


@router.get("/questions")
async def get_questions(pillar_ids: str = Query(..., description="Comma-separated pillar IDs")):
    """Return questions for the selected pillars."""
    ids = [pid.strip() for pid in pillar_ids.split(",") if pid.strip()]
    pillar_questions = _get_questions_for_pillars(ids)
    return {"pillar_questions": pillar_questions}


@router.post("/submit")
async def submit_assessment(payload: dict[str, Any]):
    """Accept assessment answers (Phase 1: log only, persistence in Phase 2)."""
    logger.info("Assessment submitted: %d pillars, payload keys: %s",
                len(payload.get("answers", {})), list(payload.get("answers", {}).keys()))
    # TODO Phase 2: persist to database
    return {
        "status": "received",
        "message": "Answers received for this request only; questionnaire answer persistence is not implemented.",
        "pillar_count": len(payload.get("answers", {})),
    }
