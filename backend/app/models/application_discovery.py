from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ApplicationDiscoveryAnnotationCreate(BaseModel):
    subscription_id: str
    resource_group: str
    business_description: str | None = None
    owning_department: str | None = None


class ApplicationDiscoveryAnnotationImportRow(ApplicationDiscoveryAnnotationCreate):
    subscription_name: str | None = None


class ApplicationDiscoveryAnnotation(BaseModel):
    id: int
    profile_id: int
    subscription_id: str
    resource_group: str
    business_description: str | None = None
    owning_department: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
