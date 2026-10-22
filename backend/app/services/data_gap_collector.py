"""Centralized data gap collector.

Every service wraps its Azure API calls in try/except and reports
unretrievable data via this collector. The gaps are surfaced on the
Data Gaps page and in the Executive Summary.

Gaps are persisted in a **global in-memory store** keyed by profile_id
so that the ``/api/data-gaps`` endpoint can retrieve gaps that were
collected across earlier requests (e.g. inventory, costs, dynamics).
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from uuid import uuid4

from app.models.insights import DataGap

# ---------------------------------------------------------------------------
# Global persistent gap store (profile_id → list[DataGap])
# ---------------------------------------------------------------------------

_store_lock = threading.Lock()
_gap_store: dict[int | None, list[DataGap]] = {}


def format_gap_reason(exc: Exception, prefix: str = "") -> str:
    """Return a concise API-aware error string for data gap reporting."""
    response = getattr(exc, "response", None)
    detail = ""
    status_code = getattr(response, "status_code", None) if response is not None else None
    if response is not None:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                detail = str(payload.get("error") or payload.get("detail") or payload)
            else:
                detail = str(payload)
        except Exception:
            detail = getattr(response, "text", "") or ""
    if not detail:
        detail = str(exc)
    detail = " ".join(detail.split())
    if len(detail) > 240:
        detail = detail[:237] + "..."
    if status_code is not None and not detail.startswith(f"HTTP {status_code}"):
        detail = f"HTTP {status_code}: {detail}"
    if prefix:
        return f"{prefix}: {detail}" if detail else prefix
    return detail


def get_persisted_gaps(profile_id: int | None = None) -> list[DataGap]:
    """Return all persisted gaps for the given profile."""
    with _store_lock:
        return list(_gap_store.get(profile_id, []))


def clear_persisted_gaps(profile_id: int | None = None) -> None:
    """Clear persisted gaps for the given profile."""
    with _store_lock:
        _gap_store.pop(profile_id, None)


def _persist_gaps(profile_id: int | None, gaps: list[DataGap]) -> None:
    """Merge new gaps into the persistent store, deduplicating by module+field."""
    with _store_lock:
        existing = _gap_store.setdefault(profile_id, [])
        seen = {(g.module, g.missing_data) for g in existing}
        for g in gaps:
            key = (g.module, g.missing_data)
            if key not in seen:
                existing.append(g)
                seen.add(key)


class DataGapCollector:
    """Request-scoped collector that also persists gaps globally."""

    def __init__(self, profile_id: int | None = None) -> None:
        self.profile_id = profile_id
        self.gaps: list[DataGap] = []

    def add_gap(
        self,
        module: str,
        field: str = "",
        reason: str = "",
        severity: str = "medium",
        remediation: str = "",
        # Legacy aliases kept for backwards-compat
        missing_data: str = "",
        recommendation: str = "",
    ) -> None:
        gap = DataGap(
            id=str(uuid4()),
            module=module,
            missing_data=field or missing_data,
            reason=reason,
            recommendation=remediation or recommendation,
            severity=severity,
            timestamp=datetime.now(timezone.utc),
        )
        self.gaps.append(gap)
        # Also persist immediately so the data-gaps page can see it later
        _persist_gaps(self.profile_id, [gap])

    def get_gaps(self) -> list[DataGap]:
        return list(self.gaps)

    def clear(self) -> None:
        self.gaps.clear()
