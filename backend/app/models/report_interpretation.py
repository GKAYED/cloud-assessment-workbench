"""Profile-scoped assessment report V2 interpretation models."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ReportVersion = Literal["legacy", "v2"]
InterpretationRunStatus = Literal["draft", "edited", "approved", "superseded"]


class ReportInterpretationSection(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    run_id: int
    section_key: str
    source_kind: str = "generated"
    generated_text: str | None = None
    edited_text: str | None = None
    final_text: str | None = None
    last_edited_at: datetime | None = None
    last_edited_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ReportInterpretationRun(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    profile_id: int
    report_version: ReportVersion = "v2"
    status: InterpretationRunStatus = "draft"
    approved: bool = False
    is_current: bool = True
    generation_trigger: str = "generate"
    source_snapshot_at: datetime | None = None
    source_profile_updated_at: datetime | None = None
    generated_at: datetime | None = None
    approved_at: datetime | None = None
    approved_by: str | None = None
    generation_model: str | None = None
    generation_notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    sections: list[ReportInterpretationSection] = Field(default_factory=list)


class ReportInterpretationState(BaseModel):
    profile_id: int
    report_version: ReportVersion = "v2"
    current_run: ReportInterpretationRun | None = None
    sections: list[ReportInterpretationSection] = Field(default_factory=list)
    has_snapshot: bool = False


class ReportInterpretationSectionUpdate(BaseModel):
    text: str
    edited_by: str | None = None


class ReportInterpretationGenerateRequest(BaseModel):
    generation_notes: str | None = None


class ReportInterpretationApproveRequest(BaseModel):
    approved_by: str | None = None
