"""Dynamics resource overrides — profile-scoped manual validation state."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import DynamicsResourceOverrideDB
from app.dependencies import get_db
from app.models.dynamics import DynamicsResourceOverride, DynamicsResourceOverrideUpsert

router = APIRouter(prefix="/api/dynamics-resource-overrides", tags=["dynamics"])


@router.get("")
async def list_dynamics_resource_overrides(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DynamicsResourceOverrideDB).where(DynamicsResourceOverrideDB.profile_id == profile_id)
    )
    rows = result.scalars().all()
    return [DynamicsResourceOverride.model_validate(row) for row in rows]


@router.post("/upsert", response_model=DynamicsResourceOverride | None)
async def upsert_dynamics_resource_override(
    body: DynamicsResourceOverrideUpsert,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(DynamicsResourceOverrideDB).where(
            DynamicsResourceOverrideDB.profile_id == profile_id,
            DynamicsResourceOverrideDB.resource_id == body.resource_id,
        )
    )
    row = existing.scalar_one_or_none()

    # "use_system" means remove the manual override.
    if body.override_status == "use_system":
        if row is not None:
            await db.delete(row)
            await db.commit()
        return None

    if row is None:
        row = DynamicsResourceOverrideDB(
            profile_id=profile_id,
            resource_id=body.resource_id,
            override_status=body.override_status,
            notes=body.notes,
        )
        db.add(row)
    else:
        row.override_status = body.override_status
        row.notes = body.notes
        row.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    return DynamicsResourceOverride.model_validate(row)
