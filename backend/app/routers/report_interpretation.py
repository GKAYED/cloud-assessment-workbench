"""Profile-scoped Assessment Report V2 interpretation router."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import (
    AssessmentSnapshotDB,
    ChallengeDB,
    CustomerProfileDB,
    FrameworkManualCafDB,
    InitiativeDB,
    OrganizationContextDB,
    RecommendationDB,
    ReportInterpretationRunDB,
    ReportInterpretationSectionDB,
    StakeholderNoteDB,
)
from app.dependencies import get_db
from app.models.report_interpretation import (
    ReportInterpretationApproveRequest,
    ReportInterpretationGenerateRequest,
    ReportInterpretationRun,
    ReportInterpretationSection,
    ReportInterpretationSectionUpdate,
    ReportInterpretationState,
)
from app.services.report_interpretation_processor import process_report_interpretation

router = APIRouter(prefix="/api/profiles", tags=["report-interpretation"])


def _snapshot_json(row: AssessmentSnapshotDB | None) -> dict | list | None:
    if row is None:
        return None
    try:
        return json.loads(row.data_json)
    except (TypeError, ValueError):
        return None


def _section_to_model(row: ReportInterpretationSectionDB) -> ReportInterpretationSection:
    return ReportInterpretationSection.model_validate(row)


def _manual_caf_ratings_json(row: FrameworkManualCafDB | None) -> dict:
    if row is None or not row.ratings_json:
        return {}
    try:
        parsed = json.loads(row.ratings_json)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _run_to_model(row: ReportInterpretationRunDB) -> ReportInterpretationRun:
    return ReportInterpretationRun(
        id=row.id,
        profile_id=row.profile_id,
        report_version=row.report_version,
        status=row.status,
        approved=row.approved,
        is_current=row.is_current,
        generation_trigger=row.generation_trigger,
        source_snapshot_at=row.source_snapshot_at,
        source_profile_updated_at=row.source_profile_updated_at,
        generated_at=row.generated_at,
        approved_at=row.approved_at,
        approved_by=row.approved_by,
        generation_model=row.generation_model,
        generation_notes=row.generation_notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
        sections=[_section_to_model(section) for section in sorted(row.sections, key=lambda item: item.section_key)],
    )


async def _load_profile(db: AsyncSession, profile_id: int) -> CustomerProfileDB:
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")
    return profile


async def _load_current_run(db: AsyncSession, profile_id: int) -> ReportInterpretationRunDB | None:
    result = await db.execute(
        select(ReportInterpretationRunDB)
        .where(
            ReportInterpretationRunDB.profile_id == profile_id,
            ReportInterpretationRunDB.is_current.is_(True),
        )
        .options(selectinload(ReportInterpretationRunDB.sections))
        .order_by(ReportInterpretationRunDB.generated_at.desc())
    )
    return result.scalars().first()


async def _load_latest_snapshot_rows(db: AsyncSession, profile_id: int) -> list[AssessmentSnapshotDB]:
    result = await db.execute(
        select(AssessmentSnapshotDB)
        .where(AssessmentSnapshotDB.profile_id == profile_id)
        .order_by(AssessmentSnapshotDB.snapshot_at.desc())
    )
    return result.scalars().all()


async def _build_grounding_bundle(db: AsyncSession, profile: CustomerProfileDB) -> tuple[dict, datetime]:
    snapshot_rows = await _load_latest_snapshot_rows(db, profile.id)
    if not snapshot_rows:
        raise HTTPException(400, detail="A saved assessment snapshot is required before interpretation generation.")

    snapshot_map: dict[str, dict | list | None] = {}
    for row in snapshot_rows:
        if row.module_name not in snapshot_map:
            snapshot_map[row.module_name] = _snapshot_json(row)
    snapshot_at = max(row.snapshot_at for row in snapshot_rows if row.snapshot_at is not None)

    org = await db.execute(select(OrganizationContextDB).where(OrganizationContextDB.profile_id == profile.id))
    organization = org.scalar_one_or_none()

    framework_manual = await db.execute(select(FrameworkManualCafDB).where(FrameworkManualCafDB.profile_id == profile.id))
    manual_caf = framework_manual.scalar_one_or_none()

    challenges = (
        await db.execute(
            select(ChallengeDB).where(ChallengeDB.profile_id == profile.id).order_by(ChallengeDB.updated_at.desc(), ChallengeDB.id.desc())
        )
    ).scalars().all()
    recommendations = (
        await db.execute(
            select(RecommendationDB).where(RecommendationDB.profile_id == profile.id).order_by(RecommendationDB.updated_at.desc(), RecommendationDB.id.desc())
        )
    ).scalars().all()
    initiatives = (
        await db.execute(
            select(InitiativeDB).where(InitiativeDB.profile_id == profile.id).order_by(InitiativeDB.updated_at.desc(), InitiativeDB.id.desc())
        )
    ).scalars().all()
    stakeholders = (
        await db.execute(
            select(StakeholderNoteDB).where(StakeholderNoteDB.profile_id == profile.id).order_by(StakeholderNoteDB.updated_at.desc(), StakeholderNoteDB.id.desc())
        )
    ).scalars().all()

    bundle = {
        "profile": {
            "id": profile.id,
            "customer_name": profile.customer_name,
            "tenant_id": profile.tenant_id,
            "tenant_display_name": profile.tenant_display_name,
            "report_version": profile.report_version,
        },
        "snapshot_at": snapshot_at.isoformat(),
        "organization_context": {
            "organisation_size": getattr(organization, "organisation_size", None),
            "organisation_overview": getattr(organization, "organisation_overview", None),
            "assessment_scope_notes": getattr(organization, "assessment_scope_notes", None),
            "assessment_boundary_notes": getattr(organization, "assessment_boundary_notes", None),
            "leadership_context_notes": getattr(organization, "leadership_context_notes", None),
            "operating_model_notes": getattr(organization, "operating_model_notes", None),
            "it_team_summary": getattr(organization, "it_team_summary", None),
            "vendor_dependency_notes": getattr(organization, "vendor_dependency_notes", None),
            "tailoring_notes": getattr(organization, "tailoring_notes", None),
        },
        "manual_context": {
            "manual_caf_ratings": _manual_caf_ratings_json(manual_caf),
            "challenges": [
                {
                    "title": row.title,
                    "category": row.category,
                    "impact_level": row.impact_level,
                    "why_it_matters": row.why_it_matters,
                    "description": row.description,
                }
                for row in challenges
            ],
            "recommendations": [
                {
                    "title": row.title,
                    "priority": row.priority,
                    "category": row.category,
                    "primary_outcome": row.primary_outcome,
                    "why_it_matters": row.why_it_matters,
                }
                for row in recommendations
            ],
            "initiatives": [
                {
                    "name": row.name,
                    "priority": row.priority,
                    "status": row.status,
                    "category": row.category,
                    "description": row.description,
                }
                for row in initiatives
            ],
            "stakeholder_notes": [
                {
                    "role": row.role,
                    "department": row.department,
                    "key_findings": row.key_findings,
                    "pain_points": row.pain_points,
                    "source_meeting": row.source_meeting,
                }
                for row in stakeholders
            ],
        },
        "evidence": {
            "inventory_summary": snapshot_map.get("inventory.summary") or {},
            "cost_summary": snapshot_map.get("cost.summary") or {},
            "framework_insights": snapshot_map.get("framework.insights") or {},
            "defender_scores": snapshot_map.get("security.defender_scores") or {},
            "advisor_scores": snapshot_map.get("security.advisor_scores") or {},
            "data_gaps": snapshot_map.get("data_gaps.list") or [],
            "governance_policy_compliance": snapshot_map.get("governance.policy_compliance") or {},
            "governance_role_assignments": snapshot_map.get("governance.role_assignments") or {},
            "insights_list": snapshot_map.get("insights.list") or [],
            "licenses_summary": snapshot_map.get("licenses.summary.v3") or {},
        },
    }

    return bundle, snapshot_at


async def _persist_generated_run(
    db: AsyncSession,
    *,
    profile: CustomerProfileDB,
    generated: dict,
    snapshot_at: datetime,
    generation_trigger: str,
    generation_notes: str | None,
) -> ReportInterpretationRunDB:
    existing = await _load_current_run(db, profile.id)
    now = datetime.now(timezone.utc)
    if existing is not None:
        existing.is_current = False
        existing.status = "superseded"
        existing.updated_at = now

    run = ReportInterpretationRunDB(
        profile_id=profile.id,
        report_version="v2",
        status="draft",
        approved=False,
        is_current=True,
        generation_trigger=generation_trigger,
        source_snapshot_at=snapshot_at,
        source_profile_updated_at=profile.updated_at,
        generated_at=now,
        generation_model=str(generated.get("generation_model") or "unknown"),
        generation_notes=(generation_notes or generated.get("generation_notes") or "").strip() or None,
    )
    db.add(run)
    await db.flush()

    for item in generated.get("sections") or []:
        text = str(item.get("text") or "").strip()
        db.add(
            ReportInterpretationSectionDB(
                run_id=run.id,
                section_key=str(item.get("section_key") or "").strip(),
                source_kind="generated",
                generated_text=text or None,
                edited_text=None,
                final_text=text or None,
            )
        )

    await db.commit()
    refreshed = await _load_current_run(db, profile.id)
    if refreshed is None:
        raise HTTPException(500, detail="Interpretation generation completed but no current run was found.")
    return refreshed


@router.get("/{profile_id}/report-interpretation", response_model=ReportInterpretationState)
async def get_report_interpretation(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await _load_profile(db, profile_id)
    snapshot_rows = await _load_latest_snapshot_rows(db, profile_id)
    current = await _load_current_run(db, profile_id)
    sections = [] if current is None else [_section_to_model(section) for section in sorted(current.sections, key=lambda item: item.section_key)]
    return ReportInterpretationState(
        profile_id=profile.id,
        report_version=profile.report_version,
        current_run=_run_to_model(current) if current is not None else None,
        sections=sections,
        has_snapshot=bool(snapshot_rows),
    )


@router.post("/{profile_id}/report-interpretation/generate", response_model=ReportInterpretationState)
async def generate_report_interpretation(
    profile_id: int,
    body: ReportInterpretationGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    profile = await _load_profile(db, profile_id)
    if profile.report_version != "v2":
        raise HTTPException(400, detail="Interpretation generation is only available for V2 report profiles.")

    bundle, snapshot_at = await _build_grounding_bundle(db, profile)
    generated = await process_report_interpretation(bundle)
    run = await _persist_generated_run(
        db,
        profile=profile,
        generated=generated,
        snapshot_at=snapshot_at,
        generation_trigger="generate",
        generation_notes=body.generation_notes,
    )
    return ReportInterpretationState(
        profile_id=profile.id,
        report_version=profile.report_version,
        current_run=_run_to_model(run),
        sections=[_section_to_model(section) for section in sorted(run.sections, key=lambda item: item.section_key)],
        has_snapshot=True,
    )


@router.post("/{profile_id}/report-interpretation/regenerate", response_model=ReportInterpretationState)
async def regenerate_report_interpretation(
    profile_id: int,
    body: ReportInterpretationGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    profile = await _load_profile(db, profile_id)
    if profile.report_version != "v2":
        raise HTTPException(400, detail="Interpretation regeneration is only available for V2 report profiles.")

    bundle, snapshot_at = await _build_grounding_bundle(db, profile)
    generated = await process_report_interpretation(bundle)
    run = await _persist_generated_run(
        db,
        profile=profile,
        generated=generated,
        snapshot_at=snapshot_at,
        generation_trigger="regenerate",
        generation_notes=body.generation_notes,
    )
    return ReportInterpretationState(
        profile_id=profile.id,
        report_version=profile.report_version,
        current_run=_run_to_model(run),
        sections=[_section_to_model(section) for section in sorted(run.sections, key=lambda item: item.section_key)],
        has_snapshot=True,
    )


@router.put("/{profile_id}/report-interpretation/sections/{section_key}", response_model=ReportInterpretationSection)
async def update_report_interpretation_section(
    profile_id: int,
    section_key: str,
    body: ReportInterpretationSectionUpdate,
    db: AsyncSession = Depends(get_db),
):
    profile = await _load_profile(db, profile_id)
    current = await _load_current_run(db, profile.id)
    if current is None:
        raise HTTPException(404, detail="No current interpretation run exists for this profile.")

    target = next((section for section in current.sections if section.section_key == section_key), None)
    if target is None:
        raise HTTPException(404, detail=f"Interpretation section '{section_key}' not found.")

    now = datetime.now(timezone.utc)
    text = body.text.strip()
    target.edited_text = text or None
    target.final_text = text or target.generated_text
    target.source_kind = "edited"
    target.last_edited_at = now
    target.last_edited_by = body.edited_by
    target.updated_at = now

    current.status = "edited"
    current.approved = False
    current.approved_at = None
    current.approved_by = None
    current.updated_at = now

    await db.commit()
    await db.refresh(target)
    return _section_to_model(target)


@router.post("/{profile_id}/report-interpretation/approve", response_model=ReportInterpretationState)
async def approve_report_interpretation(
    profile_id: int,
    body: ReportInterpretationApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    profile = await _load_profile(db, profile_id)
    current = await _load_current_run(db, profile.id)
    if current is None:
        raise HTTPException(404, detail="No current interpretation run exists for this profile.")

    now = datetime.now(timezone.utc)
    current.approved = True
    current.status = "approved"
    current.approved_at = now
    current.approved_by = body.approved_by
    current.updated_at = now

    await db.commit()
    refreshed = await _load_current_run(db, profile.id)
    if refreshed is None:
        raise HTTPException(500, detail="Interpretation approval completed but no current run was found.")
    return ReportInterpretationState(
        profile_id=profile.id,
        report_version=profile.report_version,
        current_run=_run_to_model(refreshed),
        sections=[_section_to_model(section) for section in sorted(refreshed.sections, key=lambda item: item.section_key)],
        has_snapshot=True,
    )
