"""Data gaps router — surfaces collected data gaps.

Endpoints:
  GET    /api/data-gaps          — list persisted gaps for the active profile
  DELETE /api/data-gaps          — clear persisted gaps for the active profile
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends

from app.dependencies import get_profile_id
from app.services.data_gap_collector import clear_persisted_gaps, get_persisted_gaps

router = APIRouter(prefix="/api/data-gaps", tags=["data-gaps"])


@router.get("")
async def list_data_gaps(profile_id: Optional[int] = Depends(get_profile_id)):
    """Return all data gaps collected across requests for the active profile."""
    return {"gaps": [g.model_dump() for g in get_persisted_gaps(profile_id)]}


@router.delete("", status_code=204)
async def clear_data_gaps(profile_id: Optional[int] = Depends(get_profile_id)):
    """Clear all persisted data gaps for the active profile."""
    clear_persisted_gaps(profile_id)
