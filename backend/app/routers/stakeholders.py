"""Stakeholder interview router — CRUD for StakeholderNote (profile-scoped).

Endpoints:
  GET    /api/stakeholders          ?profile_id=
  POST   /api/stakeholders          ?profile_id=
  PUT    /api/stakeholders/{id}
  DELETE /api/stakeholders/{id}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import StakeholderNoteDB
from app.dependencies import get_db
from app.models.stakeholders import (
    StakeholderNote,
    StakeholderNoteCreate,
    StakeholderNoteUpdate,
)

router = APIRouter(prefix="/api/stakeholders", tags=["stakeholders"])


def _row_to_model(row: StakeholderNoteDB) -> StakeholderNote:
    linked_apps = None
    if row.linked_app_ids:
        try:
            linked_apps = json.loads(row.linked_app_ids)
        except (json.JSONDecodeError, TypeError):
            linked_apps = None

    linked_inits = None
    if row.linked_initiative_ids:
        try:
            linked_inits = json.loads(row.linked_initiative_ids)
        except (json.JSONDecodeError, TypeError):
            linked_inits = None

    tags = None
    if row.tags:
        try:
            tags = json.loads(row.tags)
        except (json.JSONDecodeError, TypeError):
            tags = None

    return StakeholderNote(
        id=row.id,
        profile_id=row.profile_id,
        stakeholder_name=row.stakeholder_name,
        role=row.role,
        department=row.department,
        interview_date=row.interview_date,
        notes=row.notes,
        key_findings=row.key_findings,
        pain_points=row.pain_points,
        source_meeting=row.source_meeting,
        validation_status=row.validation_status,
        linked_app_ids=linked_apps,
        linked_initiative_ids=linked_inits,
        tags=tags,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("")
async def list_stakeholder_notes(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StakeholderNoteDB).where(StakeholderNoteDB.profile_id == profile_id)
    )
    return [_row_to_model(r) for r in result.scalars().all()]


@router.post("", response_model=StakeholderNote, status_code=201)
async def create_stakeholder_note(
    body: StakeholderNoteCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    entry = StakeholderNoteDB(
        profile_id=profile_id,
        stakeholder_name=body.stakeholder_name,
        role=body.role,
        department=body.department,
        interview_date=body.interview_date,
        notes=body.notes,
        key_findings=body.key_findings,
        pain_points=body.pain_points,
        source_meeting=body.source_meeting,
        validation_status=body.validation_status,
        linked_app_ids=json.dumps(body.linked_app_ids) if body.linked_app_ids else None,
        linked_initiative_ids=json.dumps(body.linked_initiative_ids) if body.linked_initiative_ids else None,
        tags=json.dumps(body.tags) if body.tags else None,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _row_to_model(entry)


@router.put("/{note_id}", response_model=StakeholderNote)
async def update_stakeholder_note(
    note_id: int,
    body: StakeholderNoteUpdate,
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(StakeholderNoteDB, note_id)
    if not entry:
        raise HTTPException(404, detail="Stakeholder note not found")

    json_fields = {"linked_app_ids", "linked_initiative_ids", "tags"}

    for field in body.model_fields_set:
        val = getattr(body, field)
        if field in json_fields:
            setattr(entry, field, json.dumps(val) if val else None)
        else:
            setattr(entry, field, val)

    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return _row_to_model(entry)


@router.delete("/{note_id}", status_code=204)
async def delete_stakeholder_note(note_id: int, db: AsyncSession = Depends(get_db)):
    entry = await db.get(StakeholderNoteDB, note_id)
    if not entry:
        raise HTTPException(404, detail="Stakeholder note not found")
    await db.delete(entry)
    await db.commit()
