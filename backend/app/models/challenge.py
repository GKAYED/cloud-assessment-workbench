"""Challenge models (Pydantic schema layer)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ChallengeCreate(BaseModel):
    challenge_id: str | None = None
    title: str
    description: str | None = None
    category: str | None = None
    impact_level: str = "High"
    primary_effect: str | None = None
    why_it_matters: str | None = None
    evidence_sources: list[str] | None = None
    reinforcement_level: str | None = None
    capability_opportunities: list[str] | None = None
    manual_entry: bool = False
    validation_status: str | None = None
    notes: str | None = None


class ChallengeUpdate(BaseModel):
    challenge_id: str | None = None
    title: str | None = None
    description: str | None = None
    category: str | None = None
    impact_level: str | None = None
    primary_effect: str | None = None
    why_it_matters: str | None = None
    evidence_sources: list[str] | None = None
    reinforcement_level: str | None = None
    capability_opportunities: list[str] | None = None
    manual_entry: bool | None = None
    validation_status: str | None = None
    notes: str | None = None


class Challenge(BaseModel):
    id: int
    profile_id: int
    challenge_id: str | None = None
    title: str
    description: str | None = None
    category: str | None = None
    impact_level: str
    primary_effect: str | None = None
    why_it_matters: str | None = None
    evidence_sources: list[str] | None = None
    reinforcement_level: str | None = None
    capability_opportunities: list[str] | None = None
    manual_entry: bool = False
    validation_status: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
