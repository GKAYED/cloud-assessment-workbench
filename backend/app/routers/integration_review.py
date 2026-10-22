"""Profile-scoped reviewed integration shortlist workspace."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import CustomerProfileDB, IntegrationReviewDB
from app.dependencies import get_db
from app.models.integration_review import (
    IntegrationReviewItem,
    IntegrationReviewRecord,
    IntegrationReviewUpdate,
)

router = APIRouter(prefix="/api/profiles", tags=["integration-review"])


def _row_to_model(row: IntegrationReviewDB) -> IntegrationReviewRecord:
    items: list[IntegrationReviewItem] = []
    if row.items_json:
        try:
            parsed = json.loads(row.items_json)
            if isinstance(parsed, list):
                items = [IntegrationReviewItem.model_validate(item) for item in parsed]
        except (TypeError, ValueError):
            items = []

    return IntegrationReviewRecord(
        id=row.id,
        profile_id=row.profile_id,
        items=items,
        is_seeded=False,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/{profile_id}/integration-review", response_model=IntegrationReviewRecord)
async def get_integration_review(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(IntegrationReviewDB).where(IntegrationReviewDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        return IntegrationReviewRecord(
            profile_id=profile_id,
            items=[],
            is_seeded=False,
        )

    return _row_to_model(row)


@router.put("/{profile_id}/integration-review", response_model=IntegrationReviewRecord)
async def upsert_integration_review(
    profile_id: int,
    body: IntegrationReviewUpdate,
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(IntegrationReviewDB).where(IntegrationReviewDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = IntegrationReviewDB(profile_id=profile_id)
        db.add(row)

    row.items_json = json.dumps([item.model_dump() for item in body.items], ensure_ascii=False)
    row.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)
