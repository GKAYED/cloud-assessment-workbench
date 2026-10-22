"""Profile-scoped report settings router."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import CustomerProfileDB, ReportSettingsDB
from app.dependencies import get_db
from app.models.report_settings import ReportSettings, ReportSettingsUpdate

router = APIRouter(prefix="/api/profiles", tags=["report-settings"])


def _row_to_model(row: ReportSettingsDB) -> ReportSettings:
    visible_sections: dict[str, bool] = {}
    appendix_sections: dict[str, bool] = {}
    if row.visible_sections_json:
        try:
            parsed = json.loads(row.visible_sections_json)
            if isinstance(parsed, dict):
                visible_sections = {str(k): bool(v) for k, v in parsed.items()}
        except (TypeError, ValueError):
            visible_sections = {}
    if row.appendix_sections_json:
        try:
            parsed = json.loads(row.appendix_sections_json)
            if isinstance(parsed, dict):
                appendix_sections = {str(k): bool(v) for k, v in parsed.items()}
        except (TypeError, ValueError):
            appendix_sections = {}

    return ReportSettings(
        id=row.id,
        profile_id=row.profile_id,
        visible_sections=visible_sections,
        appendix_sections=appendix_sections,
        release_mode=row.release_mode or "draft",
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/{profile_id}/report-settings", response_model=ReportSettings)
async def get_report_settings(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(ReportSettingsDB).where(ReportSettingsDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = ReportSettingsDB(profile_id=profile_id, release_mode="draft")
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _row_to_model(row)


@router.put("/{profile_id}/report-settings", response_model=ReportSettings)
async def upsert_report_settings(
    profile_id: int,
    body: ReportSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(select(ReportSettingsDB).where(ReportSettingsDB.profile_id == profile_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = ReportSettingsDB(profile_id=profile_id)
        db.add(row)

    row.visible_sections_json = json.dumps(body.visible_sections or {})
    row.appendix_sections_json = json.dumps(body.appendix_sections or {})
    row.release_mode = body.release_mode or "draft"
    row.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)
