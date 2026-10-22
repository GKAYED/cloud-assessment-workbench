"""Challenges router — CRUD for Challenge (profile-scoped)."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import ChallengeDB
from app.dependencies import get_db
from app.models.challenges import Challenge, ChallengeCreate, ChallengeUpdate

router = APIRouter(prefix="/api/challenges", tags=["challenges"])


def _decode_json_list(value: str | None) -> list[str] | None:
    if not value:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


def _row_to_model(row: ChallengeDB) -> Challenge:
    return Challenge(
        id=row.id,
        profile_id=row.profile_id,
        challenge_id=row.challenge_id,
        title=row.title,
        description=row.description,
        category=row.category,
        impact_level=row.impact_level,
        primary_effect=row.primary_effect,
        why_it_matters=row.why_it_matters,
        evidence_sources=_decode_json_list(row.evidence_sources),
        reinforcement_level=row.reinforcement_level,
        capability_opportunities=_decode_json_list(row.capability_opportunities),
        manual_entry=row.manual_entry,
        validation_status=row.validation_status,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[Challenge])
async def list_challenges(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChallengeDB).where(ChallengeDB.profile_id == profile_id)
    )
    return [_row_to_model(row) for row in result.scalars().all()]


@router.post("", response_model=Challenge, status_code=201)
async def create_challenge(
    body: ChallengeCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    row = ChallengeDB(
        profile_id=profile_id,
        challenge_id=body.challenge_id,
        title=body.title,
        description=body.description,
        category=body.category,
        impact_level=body.impact_level,
        primary_effect=body.primary_effect,
        why_it_matters=body.why_it_matters,
        evidence_sources=json.dumps(body.evidence_sources) if body.evidence_sources else None,
        reinforcement_level=body.reinforcement_level,
        capability_opportunities=json.dumps(body.capability_opportunities) if body.capability_opportunities else None,
        manual_entry=body.manual_entry,
        validation_status=body.validation_status,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)


@router.put("/{challenge_id}", response_model=Challenge)
async def update_challenge(
    challenge_id: int,
    body: ChallengeUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(ChallengeDB, challenge_id)
    if not row:
        raise HTTPException(404, detail="Challenge not found")

    for field in body.model_fields_set:
        value = getattr(body, field)
        if field in {"evidence_sources", "capability_opportunities"}:
            setattr(row, field, json.dumps(value) if value else None)
        else:
            setattr(row, field, value)

    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)


@router.delete("/{challenge_id}", status_code=204)
async def delete_challenge(
    challenge_id: int,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(ChallengeDB, challenge_id)
    if not row:
        raise HTTPException(404, detail="Challenge not found")
    await db.delete(row)
    await db.commit()
