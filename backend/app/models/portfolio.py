"""App portfolio models — AppPortfolioEntry (Pydantic schema layer)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AppPortfolioEntryCreate(BaseModel):
    app_name: str
    purpose: str | None = None
    business_owner: str | None = None
    technical_owner: str | None = None
    vendor: str | None = None
    support_model: str | None = None
    current_hosting: str | None = None
    status: str | None = None
    criticality: str | None = None
    linked_resource_ids: list[str] | None = None
    monthly_cost: float | None = None
    business_value: int | None = None
    technical_fitness: int | None = None
    complexity: int | None = None
    strategic_fit: int | None = None
    time_classification: str | None = None
    future_state: str | None = None
    known_risks: str | None = None
    notes: str | None = None


class AppPortfolioEntryUpdate(BaseModel):
    app_name: str | None = None
    purpose: str | None = None
    business_owner: str | None = None
    technical_owner: str | None = None
    vendor: str | None = None
    support_model: str | None = None
    current_hosting: str | None = None
    status: str | None = None
    criticality: str | None = None
    linked_resource_ids: list[str] | None = None
    monthly_cost: float | None = None
    business_value: int | None = None
    technical_fitness: int | None = None
    complexity: int | None = None
    strategic_fit: int | None = None
    time_classification: str | None = None
    future_state: str | None = None
    known_risks: str | None = None
    notes: str | None = None


class AppPortfolioEntry(BaseModel):
    id: int
    profile_id: int
    app_name: str
    purpose: str | None = None
    business_owner: str | None = None
    technical_owner: str | None = None
    vendor: str | None = None
    support_model: str | None = None
    current_hosting: str | None = None
    status: str | None = None
    criticality: str | None = None
    linked_resource_ids: list[str] | None = None
    monthly_cost: float | None = None
    business_value: int | None = None
    technical_fitness: int | None = None
    complexity: int | None = None
    strategic_fit: int | None = None
    time_classification: str | None = None
    future_state: str | None = None
    known_risks: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
