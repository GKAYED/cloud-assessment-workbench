"""Profile-scoped CAF manual assessment models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FrameworkManualCafRecord(BaseModel):
    id: int | None = None
    profile_id: int
    ratings: dict[str, dict[str, str]] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FrameworkManualCafUpdate(BaseModel):
    ratings: dict[str, dict[str, str]] = Field(default_factory=dict)
