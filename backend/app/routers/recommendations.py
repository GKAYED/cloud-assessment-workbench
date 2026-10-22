"""Recommendations router — CRUD for Recommendation (profile-scoped)."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import RecommendationDB
from app.dependencies import get_db
from app.models.recommendations import Recommendation, RecommendationCreate, RecommendationUpdate

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


def _row_to_model(row: RecommendationDB) -> Recommendation:
    evidence_sources = None
    if row.evidence_sources:
        try:
            evidence_sources = json.loads(row.evidence_sources)
        except (json.JSONDecodeError, TypeError):
            evidence_sources = None

    return Recommendation(
        id=row.id,
        profile_id=row.profile_id,
        recommendation_id=row.recommendation_id,
        title=row.title,
        description=row.description,
        priority=row.priority,
        category=row.category,
        recommendation_type=row.recommendation_type,
        primary_outcome=row.primary_outcome,
        why_it_matters=row.why_it_matters,
        practical_next_step=row.practical_next_step,
        evidence_sources=evidence_sources,
        reinforcement_level=row.reinforcement_level,
        manual_entry=row.manual_entry,
        validation_status=row.validation_status,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[Recommendation])
async def list_recommendations(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecommendationDB).where(RecommendationDB.profile_id == profile_id)
    )
    return [_row_to_model(r) for r in result.scalars().all()]


@router.post("", response_model=Recommendation, status_code=201)
async def create_recommendation(
    body: RecommendationCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    row = RecommendationDB(
        profile_id=profile_id,
        recommendation_id=body.recommendation_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        category=body.category,
        recommendation_type=body.recommendation_type,
        primary_outcome=body.primary_outcome,
        why_it_matters=body.why_it_matters,
        practical_next_step=body.practical_next_step,
        evidence_sources=json.dumps(body.evidence_sources) if body.evidence_sources else None,
        reinforcement_level=body.reinforcement_level,
        manual_entry=body.manual_entry,
        validation_status=body.validation_status,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)


@router.put("/{recommendation_id}", response_model=Recommendation)
async def update_recommendation(
    recommendation_id: int,
    body: RecommendationUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(RecommendationDB, recommendation_id)
    if not row:
        raise HTTPException(404, detail="Recommendation not found")

    for field in body.model_fields_set:
        value = getattr(body, field)
        if field == "evidence_sources":
            setattr(row, field, json.dumps(value) if value else None)
        else:
            setattr(row, field, value)

    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)


@router.delete("/{recommendation_id}", status_code=204)
async def delete_recommendation(
    recommendation_id: int,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(RecommendationDB, recommendation_id)
    if not row:
        raise HTTPException(404, detail="Recommendation not found")
    await db.delete(row)
    await db.commit()
