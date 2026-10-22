"""Transcript workflow router — profile-scoped transcript storage and markdown artefacts."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import CustomerProfileDB, TranscriptArtifactDB, TranscriptDB, TranscriptTargetDB
from app.dependencies import get_db
from app.models.transcripts import (
    ExistingMarkdownContent,
    ExistingMarkdownReference,
    Transcript,
    TranscriptArtifact,
    TranscriptArtifactUpdate,
    TranscriptCreate,
    TranscriptProcessingStatus,
    TranscriptTarget,
)
from app.services.transcript_processor import process_transcript_to_markdown, transcript_processing_enabled

router = APIRouter(prefix="/api/transcripts", tags=["transcripts"])
PROJECT_ROOT = Path(__file__).resolve().parents[3]
ASSESSMENTS_DIR = (PROJECT_ROOT / "assessments").resolve()


def _transcript_excerpt(text: str, limit: int = 1400) -> str:
    compact = re.sub(r"\s+", " ", (text or "").strip())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3].rstrip() + "..."


def _structured_notes_scaffold(title: str, source_label: str | None, transcript_text: str) -> str:
    source = source_label or "Uploaded transcript"
    excerpt = _transcript_excerpt(transcript_text)
    return (
        f"# {title} - Structured meeting notes\n\n"
        f"Source: {source}\n\n"
        "## Processing note\n\n"
        "This artefact was scaffolded automatically from a stored transcript under the active profile. "
        "It is intended as the working markdown for structured note refinement and downstream extraction.\n\n"
        "## Raw transcript excerpt\n\n"
        f"> {excerpt}\n\n"
        "## Likely participants and inferred roles\n\n"
        "- Pending review\n\n"
        "## Meeting purpose\n\n"
        "- Pending review\n\n"
        "## Structured summary\n\n"
        "- Pending review\n\n"
        "## Key observations\n\n"
        "- Pending review\n\n"
        "## Follow-on extraction hints\n\n"
        "- Use this note set as the basis for recommendations, challenges, initiatives, and any other requested outputs.\n"
    )


def _target_artifact_scaffold(transcript_title: str, target_name: str, target_description: str | None) -> str:
    description = target_description or "Pending extraction guidance."
    return (
        f"# {target_name}\n\n"
        f"Source transcript: {transcript_title}\n\n"
        f"Purpose: {description}\n\n"
        "## Processing note\n\n"
        "This markdown artefact was created automatically from the transcript workflow and should be updated as each transcript is processed.\n\n"
        "## Extracted content\n\n"
        "- Pending processing from structured meeting notes\n"
    )


def _artifact_to_model(row: TranscriptArtifactDB) -> TranscriptArtifact:
    return TranscriptArtifact.model_validate(row)


def _target_to_model(row: TranscriptTargetDB) -> TranscriptTarget:
    return TranscriptTarget.model_validate(row)


def _transcript_to_model(row: TranscriptDB) -> Transcript:
    return Transcript(
        id=row.id,
        profile_id=row.profile_id,
        title=row.title,
        source_label=row.source_label,
        transcript_text=row.transcript_text,
        status=row.status,
        targets=[_target_to_model(target) for target in sorted(row.targets, key=lambda item: item.id)],
        artifacts=[_artifact_to_model(artifact) for artifact in sorted(row.artifacts, key=lambda item: item.id)],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[Transcript])
async def list_transcripts(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TranscriptDB)
        .where(TranscriptDB.profile_id == profile_id)
        .options(selectinload(TranscriptDB.targets), selectinload(TranscriptDB.artifacts))
        .order_by(TranscriptDB.created_at.desc())
    )
    return [_transcript_to_model(row) for row in result.scalars().all()]


@router.get("/processing-status", response_model=TranscriptProcessingStatus)
async def get_transcript_processing_status():
    return TranscriptProcessingStatus(
        enabled=transcript_processing_enabled(),
        model="Configured" if transcript_processing_enabled() else None,
    )


@router.post("", response_model=Transcript, status_code=201)
async def create_transcript(
    body: TranscriptCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    transcript = TranscriptDB(
        profile_id=profile_id,
        title=body.title.strip(),
        source_label=(body.source_label or "").strip() or None,
        transcript_text=body.transcript_text.strip(),
        status="Scaffolded",
    )
    db.add(transcript)
    await db.flush()

    target_payload = [
        {
            "name": target.name.strip(),
            "description": (target.description or "").strip() or None,
        }
        for target in body.extraction_targets
        if target.name.strip()
    ]

    processed_result: dict | None = None
    processing_error: str | None = None
    if transcript_processing_enabled():
        try:
            processed_result = await process_transcript_to_markdown(
                transcript_title=transcript.title,
                source_label=transcript.source_label,
                transcript_text=transcript.transcript_text,
                extraction_targets=target_payload,
            )
            transcript.status = "Processed"
        except Exception as exc:  # pragma: no cover - fallback path
            processing_error = str(exc)
            transcript.status = "Scaffolded"

    structured_artifact = TranscriptArtifactDB(
        transcript_id=transcript.id,
        kind="structured_notes",
        title=f"{body.title.strip()} - Structured meeting notes",
        description=(
            "Primary structured meeting notes markdown generated from this transcript."
            if processed_result
            else (
                f"Primary structured-meeting-notes markdown scaffold for this transcript. Processing fallback reason: {processing_error}"
                if processing_error
                else "Primary structured-meeting-notes markdown scaffold for this transcript."
            )
        ),
        markdown_content=(
            processed_result.get("structured_notes_markdown")
            if processed_result and processed_result.get("structured_notes_markdown")
            else _structured_notes_scaffold(transcript.title, transcript.source_label, transcript.transcript_text)
        ),
    )
    db.add(structured_artifact)

    generated_target_map = {
        str(item.get("name", "")).strip().lower(): str(item.get("markdown_content", "")).strip()
        for item in (processed_result.get("targets") or [])
    } if processed_result else {}

    for target in target_payload:
        target_row = TranscriptTargetDB(
            transcript_id=transcript.id,
            name=target["name"],
            description=target["description"],
        )
        db.add(target_row)
        await db.flush()
        db.add(
            TranscriptArtifactDB(
                transcript_id=transcript.id,
                target_id=target_row.id,
                kind="extraction_target",
                title=target_row.name,
                description=target_row.description,
                markdown_content=(
                    generated_target_map.get(target_row.name.strip().lower())
                    or _target_artifact_scaffold(transcript.title, target_row.name, target_row.description)
                ),
            )
        )

    await db.commit()
    result = await db.execute(
        select(TranscriptDB)
        .where(TranscriptDB.id == transcript.id)
        .options(selectinload(TranscriptDB.targets), selectinload(TranscriptDB.artifacts))
    )
    return _transcript_to_model(result.scalar_one())


@router.put("/artifacts/{artifact_id}", response_model=TranscriptArtifact)
async def update_artifact(
    artifact_id: int,
    body: TranscriptArtifactUpdate,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(TranscriptArtifactDB, artifact_id)
    if not row:
        raise HTTPException(404, detail="Transcript artifact not found")

    for field in body.model_fields_set:
        setattr(row, field, getattr(body, field))
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _artifact_to_model(row)


@router.delete("/{transcript_id}", status_code=204)
async def delete_transcript(
    transcript_id: int,
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(TranscriptDB, transcript_id)
    if not row:
        raise HTTPException(404, detail="Transcript not found")
    await db.delete(row)
    await db.commit()


@router.get("/references", response_model=list[ExistingMarkdownReference])
async def list_existing_markdown_references():
    refs: list[ExistingMarkdownReference] = []
    if not ASSESSMENTS_DIR.exists():
        return refs

    for path in sorted(ASSESSMENTS_DIR.rglob("*.md")):
        relative = path.resolve().relative_to(ASSESSMENTS_DIR).as_posix()
        refs.append(
            ExistingMarkdownReference(
                id=relative,
                title=path.stem,
                relative_path=relative,
            )
        )
    return refs


@router.get("/references/content", response_model=ExistingMarkdownContent)
async def get_existing_markdown_content(path: str = Query(...)):
    candidate = (ASSESSMENTS_DIR / path).resolve()
    try:
        relative = candidate.relative_to(ASSESSMENTS_DIR)
    except ValueError:
        raise HTTPException(404, detail="Markdown reference not found")

    if candidate.suffix.lower() != ".md" or not candidate.is_file():
        raise HTTPException(404, detail="Markdown reference not found")

    return ExistingMarkdownContent(
        id=relative.as_posix(),
        title=candidate.stem,
        relative_path=relative.as_posix(),
        content=candidate.read_text(encoding="utf-8"),
    )
