"""Profiles router — CRUD for CustomerProfile + snapshot endpoints."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AssessmentSnapshotDB, CustomerProfileDB
from app.dependencies import get_db
from app.models.profiles import (
    CustomerProfile,
    CustomerProfileCreate,
    CustomerProfileList,
    CustomerProfileUpdate,
    ProfileActivateResponse,
    SnapshotLoadResponse,
    SnapshotModuleResponse,
    SnapshotSaveRequest,
    SnapshotSaveResponse,
)

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


# ---- CRUD ------------------------------------------------------------------


@router.get("", response_model=CustomerProfileList)
async def list_profiles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CustomerProfileDB).order_by(CustomerProfileDB.id))
    rows = result.scalars().all()
    return CustomerProfileList(profiles=[CustomerProfile.model_validate(r) for r in rows])


@router.post("", response_model=CustomerProfile, status_code=201)
async def create_profile(body: CustomerProfileCreate, db: AsyncSession = Depends(get_db)):
    if not body.customer_name or not body.customer_name.strip():
        raise HTTPException(400, detail="customer_name is required and must be non-empty")
    # A newly-created profile should not become the database-active profile
    # until authentication completes or the user explicitly activates it.
    report_version = (body.report_version or "v2").strip().lower()
    if report_version not in {"legacy", "v2"}:
        raise HTTPException(400, detail="report_version must be 'legacy' or 'v2'")
    profile = CustomerProfileDB(customer_name=body.customer_name.strip(), status="Cached", report_version=report_version)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return CustomerProfile.model_validate(profile)


@router.put("/{profile_id}", response_model=CustomerProfile)
async def update_profile(profile_id: int, body: CustomerProfileUpdate, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")
    if body.customer_name is not None:
        profile.customer_name = body.customer_name
    if body.tenant_id is not None:
        profile.tenant_id = body.tenant_id
    if body.tenant_display_name is not None:
        profile.tenant_display_name = body.tenant_display_name
    if body.report_version is not None:
        report_version = body.report_version.strip().lower()
        if report_version not in {"legacy", "v2"}:
            raise HTTPException(400, detail="report_version must be 'legacy' or 'v2'")
        profile.report_version = report_version
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)
    return CustomerProfile.model_validate(profile)


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")
    await db.delete(profile)  # cascade deletes snapshots, portfolio, initiatives, annotations
    await db.commit()


# ---- Activate --------------------------------------------------------------


@router.put("/{profile_id}/activate", response_model=ProfileActivateResponse)
async def activate_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    # Deactivate any currently-active profile
    prev_active_id = None
    result = await db.execute(select(CustomerProfileDB).where(CustomerProfileDB.status == "Active"))
    for active in result.scalars().all():
        if active.id != profile_id:
            active.status = "Cached"
            prev_active_id = active.id

    profile.status = "Active"
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return ProfileActivateResponse(
        id=profile.id,
        customer_name=profile.customer_name,
        status="Active",
        previous_active_profile_id=prev_active_id,
    )


# ---- Snapshots -------------------------------------------------------------


@router.post("/{profile_id}/snapshot", response_model=SnapshotSaveResponse, status_code=201)
async def save_snapshot(profile_id: int, body: SnapshotSaveRequest, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    now = datetime.now(timezone.utc)
    saved_count = 0

    for module_name, data in body.modules.items():
        # Upsert: delete old + insert new
        existing = await db.execute(
            select(AssessmentSnapshotDB).where(
                AssessmentSnapshotDB.profile_id == profile_id,
                AssessmentSnapshotDB.module_name == module_name,
            )
        )
        for old in existing.scalars().all():
            await db.delete(old)

        snap = AssessmentSnapshotDB(
            profile_id=profile_id,
            module_name=module_name,
            data_json=json.dumps(data),
            snapshot_at=now,
            is_partial=body.is_partial,
        )
        db.add(snap)
        saved_count += 1

    profile.last_assessed_at = now
    profile.updated_at = now
    await db.commit()

    return SnapshotSaveResponse(
        profile_id=profile_id,
        snapshot_at=now,
        modules_saved=saved_count,
        is_partial=body.is_partial,
    )


@router.get("/{profile_id}/snapshot", response_model=SnapshotLoadResponse)
async def load_snapshot(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(
        select(AssessmentSnapshotDB).where(AssessmentSnapshotDB.profile_id == profile_id)
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(404, detail="No assessment snapshot exists for this profile.")

    modules: dict = {}
    latest_at = None
    is_partial = False
    for row in rows:
        modules[row.module_name] = json.loads(row.data_json)
        if latest_at is None or row.snapshot_at > latest_at:
            latest_at = row.snapshot_at
        if row.is_partial:
            is_partial = True

    return SnapshotLoadResponse(
        profile_id=profile_id,
        customer_name=profile.customer_name,
        snapshot_at=latest_at,
        is_partial=is_partial,
        modules=modules,
    )


@router.get("/{profile_id}/snapshot/{module_name}", response_model=SnapshotModuleResponse)
async def load_snapshot_module(profile_id: int, module_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AssessmentSnapshotDB).where(
            AssessmentSnapshotDB.profile_id == profile_id,
            AssessmentSnapshotDB.module_name == module_name,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(404, detail=f"No snapshot for module '{module_name}'")

    return SnapshotModuleResponse(
        profile_id=profile_id,
        module_name=module_name,
        snapshot_at=row.snapshot_at,
        data=json.loads(row.data_json),
    )
