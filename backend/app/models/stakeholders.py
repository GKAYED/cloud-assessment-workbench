"""Stakeholder interview models — StakeholderNote (Pydantic schema layer)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class StakeholderNoteCreate(BaseModel):
    stakeholder_name: str
    role: str | None = None
    department: str | None = None
    interview_date: str | None = None
    notes: str | None = None
    key_findings: str | None = None
    pain_points: str | None = None
    source_meeting: str | None = None
    validation_status: str | None = None
    linked_app_ids: list[int] | None = None
    linked_initiative_ids: list[int] | None = None
    tags: list[str] | None = None


class StakeholderNoteUpdate(BaseModel):
    stakeholder_name: str | None = None
    role: str | None = None
    department: str | None = None
    interview_date: str | None = None
    notes: str | None = None
    key_findings: str | None = None
    pain_points: str | None = None
    source_meeting: str | None = None
    validation_status: str | None = None
    linked_app_ids: list[int] | None = None
    linked_initiative_ids: list[int] | None = None
    tags: list[str] | None = None


class StakeholderNote(BaseModel):
    id: int
    profile_id: int
    stakeholder_name: str
    role: str | None = None
    department: str | None = None
    interview_date: str | None = None
    notes: str | None = None
    key_findings: str | None = None
    pain_points: str | None = None
    source_meeting: str | None = None
    validation_status: str | None = None
    linked_app_ids: list[int] | None = None
    linked_initiative_ids: list[int] | None = None
    tags: list[str] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
