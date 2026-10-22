"""Pydantic models for organisation context and report tailoring inputs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class OrganizationImage(BaseModel):
    name: str | None = None
    data: str | None = None


class OrganizationContextBase(BaseModel):
    organisation_size: str | None = None
    organisation_overview: str | None = None
    assessment_scope_notes: str | None = None
    assessment_boundary_notes: str | None = None
    leadership_context_notes: str | None = None
    operating_model_notes: str | None = None
    it_team_summary: str | None = None
    vendor_dependency_notes: str | None = None
    tailoring_notes: str | None = None
    org_structure_image_name: str | None = None
    org_structure_image_data: str | None = None
    it_team_structure_image_name: str | None = None
    it_team_structure_image_data: str | None = None
    it_team_structure_images: list[OrganizationImage] | None = None


class OrganizationContextUpdate(OrganizationContextBase):
    pass


class OrganizationContext(OrganizationContextBase):
    id: int
    profile_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
