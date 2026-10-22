"""Organisation context router — profile-scoped context for report tailoring."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import CustomerProfileDB, OrganizationContextDB
from app.dependencies import get_db
from app.models.organization import OrganizationContext, OrganizationContextUpdate, OrganizationImage

router = APIRouter(prefix="/api/profiles", tags=["organization"])


def _row_to_model(row: OrganizationContextDB) -> OrganizationContext:
    images: list[OrganizationImage] = []
    if row.it_team_structure_images_json:
        try:
            parsed = json.loads(row.it_team_structure_images_json)
            if isinstance(parsed, list):
                images = [OrganizationImage.model_validate(item) for item in parsed if isinstance(item, dict)]
        except (TypeError, ValueError):
            images = []

    if not images and (row.it_team_structure_image_name or row.it_team_structure_image_data):
        images = [OrganizationImage(name=row.it_team_structure_image_name, data=row.it_team_structure_image_data)]

    return OrganizationContext(
        id=row.id,
        profile_id=row.profile_id,
        organisation_size=row.organisation_size,
        organisation_overview=row.organisation_overview,
        assessment_scope_notes=row.assessment_scope_notes,
        assessment_boundary_notes=row.assessment_boundary_notes,
        leadership_context_notes=row.leadership_context_notes,
        operating_model_notes=row.operating_model_notes,
        it_team_summary=row.it_team_summary,
        vendor_dependency_notes=row.vendor_dependency_notes,
        tailoring_notes=row.tailoring_notes,
        org_structure_image_name=row.org_structure_image_name,
        org_structure_image_data=row.org_structure_image_data,
        it_team_structure_image_name=row.it_team_structure_image_name,
        it_team_structure_image_data=row.it_team_structure_image_data,
        it_team_structure_images=images,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/{profile_id}/organization-context", response_model=OrganizationContext)
async def get_organization_context(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(
        select(OrganizationContextDB).where(OrganizationContextDB.profile_id == profile_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = OrganizationContextDB(profile_id=profile_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _row_to_model(row)


@router.put("/{profile_id}/organization-context", response_model=OrganizationContext)
async def upsert_organization_context(
    profile_id: int,
    body: OrganizationContextUpdate,
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(
        select(OrganizationContextDB).where(OrganizationContextDB.profile_id == profile_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = OrganizationContextDB(profile_id=profile_id)
        db.add(row)

    for field in body.model_fields:
        if field == "it_team_structure_images":
            value = getattr(body, field)
            row.it_team_structure_images_json = json.dumps(
                [item.model_dump() if hasattr(item, "model_dump") else item for item in (value or [])]
            ) if value else None
            if value:
                first = value[0]
                row.it_team_structure_image_name = first.name
                row.it_team_structure_image_data = first.data
            else:
                row.it_team_structure_image_name = None
                row.it_team_structure_image_data = None
            continue
        setattr(row, field, getattr(body, field))

    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _row_to_model(row)
