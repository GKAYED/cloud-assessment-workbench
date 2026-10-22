"""Portfolio service — TIME classification, cost linking, deprecation propagation.

Supplements the CRUD already in the portfolio router with business-logic
helpers the router (or insight engine) can call.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AppPortfolioEntryDB

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TIME Classification
# ---------------------------------------------------------------------------

_TIME_LABELS = {
    (True, True): "Invest",
    (True, False): "Migrate",
    (False, True): "Tolerate",
    (False, False): "Eliminate",
}


def compute_time(business_value: int | None, technical_fitness: int | None) -> str | None:
    """Return TIME quadrant from 1-5 business value / technical fitness scores.

    >= 4 on both axes → Invest
    >= 4 BV, < 4 TF → Migrate
    < 4 BV, >= 4 TF → Tolerate
    < 4 on both      → Eliminate
    """
    if business_value is None or technical_fitness is None:
        return None
    return _TIME_LABELS[(business_value >= 4, technical_fitness >= 4)]


# ---------------------------------------------------------------------------
# Cost auto-populate
# ---------------------------------------------------------------------------


async def link_costs_to_portfolio(
    profile_id: int,
    cost_by_resource: dict[str, float],
    db: AsyncSession,
) -> int:
    """Update monthly_cost on portfolio entries whose linked_resource_ids
    overlap with cost data.

    Returns the number of entries updated.
    """
    result = await db.execute(
        select(AppPortfolioEntryDB).where(AppPortfolioEntryDB.profile_id == profile_id)
    )
    entries = result.scalars().all()
    updated = 0
    for entry in entries:
        if not entry.linked_resource_ids:
            continue
        try:
            rids = json.loads(entry.linked_resource_ids)
        except (json.JSONDecodeError, TypeError):
            continue
        total = sum(cost_by_resource.get(rid, 0) for rid in rids)
        if total > 0:
            entry.monthly_cost = str(round(total, 2))
            updated += 1
    if updated:
        await db.commit()
    return updated


# ---------------------------------------------------------------------------
# Deprecation flag propagation
# ---------------------------------------------------------------------------


async def get_deprecated_app_ids(profile_id: int, db: AsyncSession) -> set[int]:
    """Return IDs of portfolio entries whose future_state indicates deprecation."""
    result = await db.execute(
        select(AppPortfolioEntryDB).where(AppPortfolioEntryDB.profile_id == profile_id)
    )
    deprecated = set()
    for entry in result.scalars().all():
        fs = (entry.future_state or "").lower()
        tc = (entry.time_classification or "").lower()
        if fs in ("decommission", "retire", "sunset", "eliminate") or tc == "eliminate":
            deprecated.add(entry.id)
    return deprecated


# ---------------------------------------------------------------------------
# Portfolio summary (for insight engine)
# ---------------------------------------------------------------------------


async def get_portfolio_summary(profile_id: int, db: AsyncSession) -> dict:
    """Lightweight summary of the portfolio for dashboards / insights."""
    result = await db.execute(
        select(AppPortfolioEntryDB).where(AppPortfolioEntryDB.profile_id == profile_id)
    )
    entries = list(result.scalars().all())

    time_counts: dict[str, int] = {}
    criticality_counts: dict[str, int] = {}
    total_cost = 0.0

    for e in entries:
        tc = e.time_classification or "Unclassified"
        time_counts[tc] = time_counts.get(tc, 0) + 1
        crit = e.criticality or "Unknown"
        criticality_counts[crit] = criticality_counts.get(crit, 0) + 1
        if e.monthly_cost:
            try:
                total_cost += float(e.monthly_cost)
            except ValueError:
                pass

    return {
        "total_apps": len(entries),
        "by_time": time_counts,
        "by_criticality": criticality_counts,
        "total_monthly_cost": round(total_cost, 2),
    }
