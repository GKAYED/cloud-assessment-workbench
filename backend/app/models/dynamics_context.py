"""Pydantic models for profile-scoped Dynamics manual context."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class DynamicsManualContextBase(BaseModel):
    extra_environments: str | None = None
    dataverse_capacity_notes: str | None = None
    dataverse_license_notes: str | None = None
    dataverse_cost_notes: str | None = None
    discovery_gap_notes: str | None = None
    additional_notes: str | None = None


class DynamicsManualContextUpdate(DynamicsManualContextBase):
    pass


class DynamicsManualContext(DynamicsManualContextBase):
    id: int
    profile_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
