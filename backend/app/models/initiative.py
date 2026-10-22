"""Initiative Pydantic schema layer."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class InitiativeCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "Planned"
    priority: str = "Medium"
    complexity: int | None = None
    strategic_fit: int | None = None
    linked_app_ids: list[int] | None = None
    dependency_ids: list[int] | None = None
    lane: str | None = None
    planned_start_quarter: str | None = None
    planned_end_quarter: str | None = None
    target_quarter: str | None = None
    category: str | None = None
    estimated_effort_weeks: float | None = None
    estimated_cost_saving: float | None = None
    business_owner: str | None = None
    technical_owner: str | None = None
    validation_status: str | None = None
    evidence_confidence: str | None = None
    parent_initiative_id: int | None = None
    deprecation_aligned: bool | None = None


class InitiativeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    complexity: int | None = None
    strategic_fit: int | None = None
    linked_app_ids: list[int] | None = None
    dependency_ids: list[int] | None = None
    lane: str | None = None
    planned_start_quarter: str | None = None
    planned_end_quarter: str | None = None
    target_quarter: str | None = None
    category: str | None = None
    estimated_effort_weeks: float | None = None
    estimated_cost_saving: float | None = None
    business_owner: str | None = None
    technical_owner: str | None = None
    validation_status: str | None = None
    evidence_confidence: str | None = None
    parent_initiative_id: int | None = None
    deprecation_aligned: bool | None = None


class Initiative(BaseModel):
    id: int
    profile_id: int
    name: str
    title: str | None = None
    description: str | None = None
    status: str
    priority: str
    estimated_effort_weeks: float | None = None
    estimated_cost_saving: float | None = None
    complexity: int | None = None
    strategic_fit: int | None = None
    linked_app_ids: list[int] | None = None
    dependency_ids: list[int] | None = None
    lane: str | None = None
    planned_start_quarter: str | None = None
    planned_end_quarter: str | None = None
    target_quarter: str | None = None
    category: str | None = None
    business_owner: str | None = None
    technical_owner: str | None = None
    validation_status: str | None = None
    evidence_confidence: str | None = None
    parent_initiative_id: int | None = None
    prioritization_score: float | None = None
    deprecation_aligned: bool
    deprecation_aligned_override: bool | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
