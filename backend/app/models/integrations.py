"""Integration models — IntegrationPoint, IntegrationAnnotation (Pydantic)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class IntegrationPoint(BaseModel):
    id: str
    source_resource_id: str
    source_resource_name: str
    source_resource_type: str
    integration_type: str  # ConnectionString | LinkedService | APIConnection | ...
    target_resource_id: str = ""
    target_name: str = ""
    target_type: str = ""
    direction: str = "Outbound"  # Inbound | Outbound | Bidirectional
    details: str = ""
    subscription_id: str = ""
    is_deprecated_source: bool = False
    is_deprecated_target: bool = False
    annotation: str | None = None


class IntegrationAnnotation(BaseModel):
    id: int
    profile_id: int
    integration_id: str
    is_manual: bool = False
    integration_name: str | None = None
    source_component: str | None = None
    target_endpoint: str | None = None
    source_application: str | None = None
    target_application: str | None = None
    logical_integration_group: str | None = None
    subscription_name: str | None = None
    resource_group_name: str | None = None
    integration_type: str | None = None
    protocol: str | None = None
    direction: str | None = None
    business_purpose: str | None = None
    external_party_vendor: str | None = None
    owning_department: str | None = None
    business_owner: str | None = None
    criticality: str | None = None
    environment: str | None = None
    validation_status: str | None = None
    annotation_text: str
    annotated_by: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IntegrationAnnotationCreate(BaseModel):
    integration_id: str
    is_manual: bool = False
    integration_name: str | None = None
    source_component: str | None = None
    target_endpoint: str | None = None
    source_application: str | None = None
    target_application: str | None = None
    logical_integration_group: str | None = None
    subscription_name: str | None = None
    resource_group_name: str | None = None
    integration_type: str | None = None
    protocol: str | None = None
    direction: str | None = None
    business_purpose: str | None = None
    external_party_vendor: str | None = None
    owning_department: str | None = None
    business_owner: str | None = None
    criticality: str | None = None
    environment: str | None = None
    validation_status: str | None = None
    annotation_text: str | None = None
    annotated_by: str | None = None


class IntegrationAnnotationUpdate(BaseModel):
    is_manual: bool | None = None
    integration_name: str | None = None
    source_component: str | None = None
    target_endpoint: str | None = None
    source_application: str | None = None
    target_application: str | None = None
    logical_integration_group: str | None = None
    subscription_name: str | None = None
    resource_group_name: str | None = None
    integration_type: str | None = None
    protocol: str | None = None
    direction: str | None = None
    business_purpose: str | None = None
    external_party_vendor: str | None = None
    owning_department: str | None = None
    business_owner: str | None = None
    criticality: str | None = None
    environment: str | None = None
    validation_status: str | None = None
    annotation_text: str | None = None


class IntegrationAnnotationImportRow(IntegrationAnnotationCreate):
    row_type: str | None = None
    name: str | None = None
    source_resource_name: str | None = None
    target_name: str | None = None


class IntegrationSummary(BaseModel):
    total_integrations: int = 0
    by_type: dict[str, int] = {}
    deprecated_count: int = 0


class IntegrationRecommendation(BaseModel):
    title: str
    description: str
    affected_integrations: list[str] = []
    priority: str = "Medium"
