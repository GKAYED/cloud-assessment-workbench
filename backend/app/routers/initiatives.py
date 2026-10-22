"""Initiatives router — CRUD for Initiative (profile-scoped).

Endpoints:
  GET    /api/initiatives          ?profile_id=
  POST   /api/initiatives          ?profile_id=
  PUT    /api/initiatives/{id}
  DELETE /api/initiatives/{id}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import InitiativeDB
from app.dependencies import get_db
from app.models.initiatives import Initiative, InitiativeCreate, InitiativeUpdate
from app.services.portfolio_service import get_deprecated_app_ids

router = APIRouter(prefix="/api/initiatives", tags=["initiatives"])

_PRIORITY_WEIGHTS = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}


def _compute_score(priority: str, strategic_fit: int | None, complexity: int | None) -> float | None:
    if strategic_fit is None or complexity is None or complexity == 0:
        return None
    w = _PRIORITY_WEIGHTS.get(priority, 2)
    return round((w * strategic_fit) / complexity, 2)


def _row_to_model(row: InitiativeDB, deprecated_app_ids: set[int] | None = None) -> Initiative:
    linked = None
    if row.linked_app_ids:
        try:
            linked = json.loads(row.linked_app_ids)
        except (json.JSONDecodeError, TypeError):
            linked = None
    deps = None
    if row.dependency_ids:
        try:
            deps = json.loads(row.dependency_ids)
        except (json.JSONDecodeError, TypeError):
            deps = None

    derived_dep_aligned = False
    if linked and deprecated_app_ids:
        derived_dep_aligned = bool(set(linked) & deprecated_app_ids)
    dep_aligned = row.deprecation_aligned_override if row.deprecation_aligned_override is not None else derived_dep_aligned

    return Initiative(
        id=row.id,
        profile_id=row.profile_id,
        name=row.name,
        description=row.description,
        status=row.status,
        priority=row.priority,
        complexity=row.complexity,
        strategic_fit=row.strategic_fit,
        linked_app_ids=linked,
        dependency_ids=deps,
        lane=row.lane,
        planned_start_quarter=row.planned_start_quarter,
        planned_end_quarter=row.planned_end_quarter,
        target_quarter=row.target_quarter,
        category=row.category,
        estimated_effort_weeks=float(row.estimated_effort_weeks) if row.estimated_effort_weeks else None,
        estimated_cost_saving=float(row.estimated_cost_saving) if row.estimated_cost_saving else None,
        business_owner=row.business_owner,
        technical_owner=row.technical_owner,
        validation_status=row.validation_status,
        evidence_confidence=row.evidence_confidence,
        parent_initiative_id=row.parent_initiative_id,
        prioritization_score=_compute_score(row.priority, row.strategic_fit, row.complexity),
        deprecation_aligned=dep_aligned,
        deprecation_aligned_override=row.deprecation_aligned_override,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("")
async def list_initiatives(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    deprecated_app_ids = await get_deprecated_app_ids(profile_id, db)
    result = await db.execute(
        select(InitiativeDB).where(InitiativeDB.profile_id == profile_id)
    )
    return [_row_to_model(r, deprecated_app_ids) for r in result.scalars().all()]


@router.post("", response_model=Initiative, status_code=201)
async def create_initiative(
    body: InitiativeCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    deprecated_app_ids = await get_deprecated_app_ids(profile_id, db)
    row = InitiativeDB(
        profile_id=profile_id,
        name=body.name,
        description=body.description,
        status=body.status,
        priority=body.priority,
        complexity=body.complexity,
        strategic_fit=body.strategic_fit,
        linked_app_ids=json.dumps(body.linked_app_ids) if body.linked_app_ids else None,
        dependency_ids=json.dumps(body.dependency_ids) if body.dependency_ids else None,
        planned_start_quarter=body.planned_start_quarter.strip() if body.planned_start_quarter and body.planned_start_quarter.strip() else None,
        planned_end_quarter=body.planned_end_quarter.strip() if body.planned_end_quarter and body.planned_end_quarter.strip() else None,
        target_quarter=body.target_quarter.strip() if body.target_quarter and body.target_quarter.strip() else None,
        category=body.category,
        lane=body.lane,
        estimated_effort_weeks=str(body.estimated_effort_weeks) if body.estimated_effort_weeks is not None else None,
        estimated_cost_saving=str(body.estimated_cost_saving) if body.estimated_cost_saving is not None else None,
        business_owner=body.business_owner,
        technical_owner=body.technical_owner,
        validation_status=body.validation_status,
        evidence_confidence=body.evidence_confidence,
        parent_initiative_id=body.parent_initiative_id,
        deprecation_aligned_override=body.deprecation_aligned,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row, deprecated_app_ids)


@router.put("/{initiative_id}", response_model=Initiative)
async def update_initiative(
    initiative_id: int,
    body: InitiativeUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(InitiativeDB, initiative_id)
    if not row:
        raise HTTPException(404, detail="Initiative not found")

    for field in body.model_fields_set:
        val = getattr(body, field)
        if field in ("linked_app_ids", "dependency_ids"):
            setattr(row, field, json.dumps(val) if val else None)
        elif field == "deprecation_aligned":
            row.deprecation_aligned_override = val
        elif field in ("estimated_effort_weeks", "estimated_cost_saving"):
            setattr(row, field, str(val) if val is not None else None)
        elif field in ("planned_start_quarter", "planned_end_quarter", "target_quarter"):
            normalized = val.strip() if isinstance(val, str) else None
            setattr(row, field, normalized if normalized else None)
        else:
            setattr(row, field, val)

    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    deprecated_app_ids = await get_deprecated_app_ids(row.profile_id, db)
    return _row_to_model(row, deprecated_app_ids)


@router.delete("/{initiative_id}", status_code=204)
async def delete_initiative(initiative_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(InitiativeDB, initiative_id)
    if not row:
        raise HTTPException(404, detail="Initiative not found")
    await db.delete(row)
    await db.commit()


@router.get("/timeline")
async def initiative_timeline(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    from app.services.initiative_service import get_initiative_timeline

    return await get_initiative_timeline(profile_id, db)
