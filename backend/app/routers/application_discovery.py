from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import ApplicationDiscoveryAnnotationDB
from app.dependencies import get_db
from app.models.application_discovery import (
    ApplicationDiscoveryAnnotation,
    ApplicationDiscoveryAnnotationCreate,
    ApplicationDiscoveryAnnotationImportRow,
)

router = APIRouter(prefix="/api/application-discovery", tags=["application-discovery"])


def _normalize_resource_group(value: str | None) -> str:
    return str(value or "").strip()


def _annotation_to_model(row: ApplicationDiscoveryAnnotationDB) -> ApplicationDiscoveryAnnotation:
    return ApplicationDiscoveryAnnotation.model_validate(row)


async def _find_existing(
    db: AsyncSession,
    profile_id: int,
    subscription_id: str,
    resource_group: str,
) -> ApplicationDiscoveryAnnotationDB | None:
    normalized_group = _normalize_resource_group(resource_group).lower()
    result = await db.execute(
        select(ApplicationDiscoveryAnnotationDB).where(
            ApplicationDiscoveryAnnotationDB.profile_id == profile_id,
            ApplicationDiscoveryAnnotationDB.subscription_id == subscription_id.strip(),
            func.lower(ApplicationDiscoveryAnnotationDB.resource_group) == normalized_group,
        )
    )
    return result.scalar_one_or_none()


@router.get("/annotations", response_model=list[ApplicationDiscoveryAnnotation])
async def list_annotations(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApplicationDiscoveryAnnotationDB)
        .where(ApplicationDiscoveryAnnotationDB.profile_id == profile_id)
        .order_by(ApplicationDiscoveryAnnotationDB.subscription_id, ApplicationDiscoveryAnnotationDB.resource_group)
    )
    return [_annotation_to_model(row) for row in result.scalars().all()]


@router.post("/annotations", response_model=ApplicationDiscoveryAnnotation, status_code=201)
async def upsert_annotation(
    body: ApplicationDiscoveryAnnotationCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    existing = await _find_existing(db, profile_id, body.subscription_id, body.resource_group)
    if existing:
        existing.business_description = body.business_description.strip() if body.business_description else None
        existing.owning_department = body.owning_department.strip() if body.owning_department else None
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return _annotation_to_model(existing)

    row = ApplicationDiscoveryAnnotationDB(
        profile_id=profile_id,
        subscription_id=body.subscription_id.strip(),
        resource_group=_normalize_resource_group(body.resource_group),
        business_description=body.business_description.strip() if body.business_description else None,
        owning_department=body.owning_department.strip() if body.owning_department else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _annotation_to_model(row)


@router.post("/annotations/import", response_model=list[ApplicationDiscoveryAnnotation])
async def import_annotations(
    rows: list[ApplicationDiscoveryAnnotationImportRow],
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    saved: list[ApplicationDiscoveryAnnotation] = []
    for item in rows:
        if not item.subscription_id.strip() or not _normalize_resource_group(item.resource_group):
            continue
        if not (item.business_description and item.business_description.strip()) and not (
            item.owning_department and item.owning_department.strip()
        ):
            continue

        existing = await _find_existing(db, profile_id, item.subscription_id, item.resource_group)
        if existing:
            existing.business_description = item.business_description.strip() if item.business_description else None
            existing.owning_department = item.owning_department.strip() if item.owning_department else None
            existing.updated_at = datetime.now(timezone.utc)
            saved.append(_annotation_to_model(existing))
            continue

        row = ApplicationDiscoveryAnnotationDB(
            profile_id=profile_id,
            subscription_id=item.subscription_id.strip(),
            resource_group=_normalize_resource_group(item.resource_group),
            business_description=item.business_description.strip() if item.business_description else None,
            owning_department=item.owning_department.strip() if item.owning_department else None,
        )
        db.add(row)
        await db.flush()
        saved.append(_annotation_to_model(row))

    await db.commit()
    for item in saved:
        # No-op loop keeps response ordering stable after commit.
        pass
    return saved
