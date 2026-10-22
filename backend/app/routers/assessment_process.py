"""Profile-scoped assessment process tracker router."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AssessmentProcessDB, CustomerProfileDB
from app.dependencies import get_db
from app.models.assessment_process import AssessmentProcessRecord, AssessmentProcessUpdate

router = APIRouter(prefix="/api/profiles", tags=["assessment-process"])


def _row_to_model(row: AssessmentProcessDB) -> AssessmentProcessRecord:
    checklist: dict[str, bool] = {}
    if row.checklist_json:
        try:
            parsed = json.loads(row.checklist_json)
            if isinstance(parsed, dict):
                checklist = {str(k): bool(v) for k, v in parsed.items()}
        except (TypeError, ValueError):
            checklist = {}

    return AssessmentProcessRecord(
        id=row.id,
        profile_id=row.profile_id,
        checklist=checklist,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/{profile_id}/assessment-process", response_model=AssessmentProcessRecord)
async def get_assessment_process(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(AssessmentProcessDB).where(AssessmentProcessDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = AssessmentProcessDB(profile_id=profile_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _row_to_model(row)


@router.put("/{profile_id}/assessment-process", response_model=AssessmentProcessRecord)
async def upsert_assessment_process(
    profile_id: int,
    body: AssessmentProcessUpdate,
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(AssessmentProcessDB).where(AssessmentProcessDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = AssessmentProcessDB(profile_id=profile_id)
        db.add(row)

    row.checklist_json = json.dumps(body.checklist or {})
    row.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)
