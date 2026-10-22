"""Portfolio router — CRUD for AppPortfolioEntry (profile-scoped).

Endpoints:
  GET    /api/portfolio          ?profile_id=
  POST   /api/portfolio          ?profile_id=
  PUT    /api/portfolio/{id}
  DELETE /api/portfolio/{id}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AppPortfolioEntryDB
from app.dependencies import get_db
from app.models.portfolio import (
    AppPortfolioEntry,
    AppPortfolioEntryCreate,
    AppPortfolioEntryUpdate,
)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


def _compute_time(bv: int | None, tf: int | None) -> str | None:
    """Compute TIME classification from business_value and technical_fitness."""
    if bv is None or tf is None:
        return None
    if bv >= 4 and tf >= 4:
        return "Invest"
    if bv >= 4 and tf < 4:
        return "Migrate"
    if bv < 4 and tf >= 4:
        return "Tolerate"
    return "Eliminate"


def _resolved_time(explicit: str | None, bv: int | None, tf: int | None) -> str | None:
    value = (explicit or "").strip()
    if value:
        return value
    return _compute_time(bv, tf)


def _row_to_model(row: AppPortfolioEntryDB) -> AppPortfolioEntry:
    linked = None
    if row.linked_resource_ids:
        try:
            linked = json.loads(row.linked_resource_ids)
        except (json.JSONDecodeError, TypeError):
            linked = None
    cost = None
    if row.monthly_cost is not None:
        try:
            cost = float(row.monthly_cost)
        except (ValueError, TypeError):
            cost = None
    return AppPortfolioEntry(
        id=row.id,
        profile_id=row.profile_id,
        app_name=row.app_name,
        purpose=row.purpose,
        business_owner=row.business_owner,
        technical_owner=row.technical_owner,
        vendor=row.vendor,
        support_model=row.support_model,
        current_hosting=row.current_hosting,
        status=row.status,
        criticality=row.criticality,
        linked_resource_ids=linked,
        monthly_cost=cost,
        business_value=row.business_value,
        technical_fitness=row.technical_fitness,
        complexity=row.complexity,
        strategic_fit=row.strategic_fit,
        time_classification=row.time_classification,
        future_state=row.future_state,
        known_risks=row.known_risks,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("")
async def list_portfolio(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AppPortfolioEntryDB).where(AppPortfolioEntryDB.profile_id == profile_id)
    )
    return [_row_to_model(r) for r in result.scalars().all()]


@router.post("", response_model=AppPortfolioEntry, status_code=201)
async def create_entry(
    body: AppPortfolioEntryCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    entry = AppPortfolioEntryDB(
        profile_id=profile_id,
        app_name=body.app_name,
        purpose=body.purpose,
        business_owner=body.business_owner,
        technical_owner=body.technical_owner,
        vendor=body.vendor,
        support_model=body.support_model,
        current_hosting=body.current_hosting,
        status=body.status,
        criticality=body.criticality,
        linked_resource_ids=json.dumps(body.linked_resource_ids) if body.linked_resource_ids else None,
        monthly_cost=str(body.monthly_cost) if body.monthly_cost is not None else None,
        business_value=body.business_value,
        technical_fitness=body.technical_fitness,
        complexity=body.complexity,
        strategic_fit=body.strategic_fit,
        time_classification=_resolved_time(body.time_classification, body.business_value, body.technical_fitness),
        future_state=body.future_state,
        known_risks=body.known_risks,
        notes=body.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _row_to_model(entry)


@router.put("/{entry_id}", response_model=AppPortfolioEntry)
async def update_entry(
    entry_id: int,
    body: AppPortfolioEntryUpdate,
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(AppPortfolioEntryDB, entry_id)
    if not entry:
        raise HTTPException(404, detail="Portfolio entry not found")

    explicit_time_provided = "time_classification" in body.model_fields_set

    for field in body.model_fields_set:
        val = getattr(body, field)
        if field == "linked_resource_ids":
            setattr(entry, field, json.dumps(val) if val else None)
        elif field == "monthly_cost":
            setattr(entry, field, str(val) if val is not None else None)
        else:
            setattr(entry, field, val)

    # Preserve explicit TIME selections. Only fall back to score-based calculation
    # when the field is blank or was never set.
    if explicit_time_provided:
        entry.time_classification = _resolved_time(body.time_classification, entry.business_value, entry.technical_fitness)
    elif not (entry.time_classification or "").strip():
        entry.time_classification = _resolved_time(None, entry.business_value, entry.technical_fitness)

    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return _row_to_model(entry)


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    entry = await db.get(AppPortfolioEntryDB, entry_id)
    if not entry:
        raise HTTPException(404, detail="Portfolio entry not found")
    await db.delete(entry)
    await db.commit()
