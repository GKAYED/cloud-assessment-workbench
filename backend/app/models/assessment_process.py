from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AssessmentProcessRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    profile_id: int
    checklist: dict[str, bool] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssessmentProcessUpdate(BaseModel):
    checklist: dict[str, bool] = Field(default_factory=dict)
