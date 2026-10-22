"""Recommendation models (Pydantic schema layer)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class RecommendationCreate(BaseModel):
    recommendation_id: str | None = None
    title: str
    description: str | None = None
    priority: str = "P2"
    category: str | None = None
    recommendation_type: str | None = None
    primary_outcome: str | None = None
    why_it_matters: str | None = None
    practical_next_step: str | None = None
    evidence_sources: list[str] | None = None
    reinforcement_level: str | None = None
    manual_entry: bool = False
    validation_status: str | None = None
    notes: str | None = None


class RecommendationUpdate(BaseModel):
    recommendation_id: str | None = None
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    category: str | None = None
    recommendation_type: str | None = None
    primary_outcome: str | None = None
    why_it_matters: str | None = None
    practical_next_step: str | None = None
    evidence_sources: list[str] | None = None
    reinforcement_level: str | None = None
    manual_entry: bool | None = None
    validation_status: str | None = None
    notes: str | None = None


class Recommendation(BaseModel):
    id: int
    profile_id: int
    recommendation_id: str | None = None
    title: str
    description: str | None = None
    priority: str
    category: str | None = None
    recommendation_type: str | None = None
    primary_outcome: str | None = None
    why_it_matters: str | None = None
    practical_next_step: str | None = None
    evidence_sources: list[str] | None = None
    reinforcement_level: str | None = None
    manual_entry: bool = False
    validation_status: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
