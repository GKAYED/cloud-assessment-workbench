"""Profile-scoped Dynamics manual context router."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import CustomerProfileDB, DynamicsManualContextDB
from app.dependencies import get_db
from app.models.dynamics_context import DynamicsManualContext, DynamicsManualContextUpdate

router = APIRouter(prefix="/api/profiles", tags=["dynamics-context"])


def _row_to_model(row: DynamicsManualContextDB) -> DynamicsManualContext:
    return DynamicsManualContext.model_validate(row)


@router.get("/{profile_id}/dynamics-manual-context", response_model=DynamicsManualContext)
async def get_dynamics_manual_context(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(
        select(DynamicsManualContextDB).where(DynamicsManualContextDB.profile_id == profile_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = DynamicsManualContextDB(profile_id=profile_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _row_to_model(row)


@router.put("/{profile_id}/dynamics-manual-context", response_model=DynamicsManualContext)
async def upsert_dynamics_manual_context(
    profile_id: int,
    body: DynamicsManualContextUpdate,
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(
        select(DynamicsManualContextDB).where(DynamicsManualContextDB.profile_id == profile_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = DynamicsManualContextDB(profile_id=profile_id)
        db.add(row)

    for field in body.model_fields:
        setattr(row, field, getattr(body, field))

    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)
