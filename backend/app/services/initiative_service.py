"""Initiative service — prioritization scoring, dependency DAG, timeline.

Supplements the CRUD in the initiatives router with business-logic
helpers for prioritization and sequencing.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict, deque
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import InitiativeDB

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Priority weights
# ---------------------------------------------------------------------------

_PRIORITY_WEIGHTS = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}


def compute_prioritization_score(
    priority: str,
    strategic_fit: int | None,
    complexity: int | None,
) -> float | None:
    """Weighted score: (priority_weight * strategic_fit) / complexity.

    Higher is better.  Returns None when inputs are missing.
    """
    if strategic_fit is None or complexity is None or complexity == 0:
        return None
    w = _PRIORITY_WEIGHTS.get(priority, 2)
    return round((w * strategic_fit) / complexity, 2)


# ---------------------------------------------------------------------------
# Dependency DAG validation
# ---------------------------------------------------------------------------


def validate_dependency_dag(
    initiatives: list[dict],
) -> tuple[bool, list[str]]:
    """Check for cycles in the dependency graph.

    Args:
        initiatives: list of dicts with ``id`` and ``dependency_ids`` keys.

    Returns:
        (is_valid, errors) — is_valid=True if no cycles.
    """
    graph: dict[int, list[int]] = defaultdict(list)
    in_degree: dict[int, int] = {}
    all_ids = set()

    for init in initiatives:
        iid = init["id"]
        all_ids.add(iid)
        in_degree.setdefault(iid, 0)
        for dep in init.get("dependency_ids") or []:
            graph[dep].append(iid)
            in_degree[iid] = in_degree.get(iid, 0) + 1
            all_ids.add(dep)

    # Kahn's algorithm
    queue: deque[int] = deque()
    for nid in all_ids:
        if in_degree.get(nid, 0) == 0:
            queue.append(nid)

    visited = 0
    while queue:
        node = queue.popleft()
        visited += 1
        for neighbour in graph[node]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    if visited < len(all_ids):
        return False, ["Circular dependency detected in initiative graph."]
    return True, []


# ---------------------------------------------------------------------------
# Topological sort / timeline
# ---------------------------------------------------------------------------


def topological_sort(initiatives: list[dict]) -> list[dict]:
    """Return initiatives in dependency-respecting order (topological sort).

    Uses Kahn's algorithm.  Falls back to original order if graph
    contains a cycle (which should be caught by validate first).
    """
    id_map = {i["id"]: i for i in initiatives}
    graph: dict[int, list[int]] = defaultdict(list)
    in_degree: dict[int, int] = {i["id"]: 0 for i in initiatives}

    for init in initiatives:
        for dep in init.get("dependency_ids") or []:
            if dep in id_map:
                graph[dep].append(init["id"])
                in_degree[init["id"]] += 1

    queue: deque[int] = deque(
        nid for nid, deg in in_degree.items() if deg == 0
    )
    sorted_ids: list[int] = []
    while queue:
        node = queue.popleft()
        sorted_ids.append(node)
        for neighbour in graph[node]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    if len(sorted_ids) < len(initiatives):
        # Cycle detected — return original order
        return initiatives

    return [id_map[nid] for nid in sorted_ids]


# ---------------------------------------------------------------------------
# Timeline generation
# ---------------------------------------------------------------------------


async def get_initiative_timeline(
    profile_id: int,
    db: AsyncSession,
) -> dict:
    """Generate a sequenced timeline of initiatives respecting dependencies.

    Returns initiatives in topological order grouped by target_quarter.
    """
    result = await db.execute(
        select(InitiativeDB).where(InitiativeDB.profile_id == profile_id)
    )
    rows = list(result.scalars().all())

    initiatives = []
    for r in rows:
        deps = None
        if r.dependency_ids:
            try:
                deps = json.loads(r.dependency_ids)
            except (json.JSONDecodeError, TypeError):
                deps = None
        linked = None
        if r.linked_app_ids:
            try:
                linked = json.loads(r.linked_app_ids)
            except (json.JSONDecodeError, TypeError):
                linked = None

        initiatives.append({
            "id": r.id,
            "name": r.name,
            "status": r.status,
            "priority": r.priority,
            "complexity": r.complexity,
            "strategic_fit": r.strategic_fit,
            "planned_start_quarter": r.planned_start_quarter,
            "planned_end_quarter": r.planned_end_quarter,
            "target_quarter": r.target_quarter,
            "category": r.category,
            "dependency_ids": deps,
            "linked_app_ids": linked,
            "score": compute_prioritization_score(r.priority, r.strategic_fit, r.complexity),
        })

    # Validate DAG
    is_valid, errors = validate_dependency_dag(initiatives)

    # Sort topologically
    sorted_items = topological_sort(initiatives)

    # Group by quarter
    by_quarter: dict[str, list[dict]] = defaultdict(list)
    for item in sorted_items:
        q = item.get("planned_start_quarter") or item.get("target_quarter") or "Unscheduled"
        by_quarter[q].append(item)

    return {
        "timeline": [
            {"quarter": q, "initiatives": items}
            for q, items in by_quarter.items()
        ],
        "total_count": len(initiatives),
        "is_dag_valid": is_valid,
        "dag_errors": errors,
        "sequence": [{"id": i["id"], "name": i["name"]} for i in sorted_items],
    }


# ---------------------------------------------------------------------------
# Initiative summary (for insight engine)
# ---------------------------------------------------------------------------


async def get_initiative_summary(profile_id: int, db: AsyncSession) -> dict:
    """Lightweight summary for dashboards."""
    result = await db.execute(
        select(InitiativeDB).where(InitiativeDB.profile_id == profile_id)
    )
    rows = list(result.scalars().all())

    status_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}
    for r in rows:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1
        priority_counts[r.priority] = priority_counts.get(r.priority, 0) + 1

    return {
        "total_initiatives": len(rows),
        "by_status": status_counts,
        "by_priority": priority_counts,
    }
