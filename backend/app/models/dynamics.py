"""Dynamics 365 models — Environment, User, ModuleStats, WorkflowHealth, BCStats."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class D365Environment(BaseModel):
    id: str
    display_name: str
    environment_type: str  # Production | Sandbox | Developer | Trial
    region: str = ""
    url: str = ""
    database_capacity_used_mb: float = 0.0
    database_capacity_allocated_mb: float = 0.0
    file_capacity_used_mb: float = 0.0
    file_capacity_allocated_mb: float = 0.0
    state: str = "Ready"


class D365User(BaseModel):
    user_id: str
    full_name: str
    email: str = ""
    is_disabled: bool = False
    business_unit: str = ""
    security_roles: list[str] = []
    last_login: datetime | None = None
    is_active_30d: bool = False


class D365ModuleStats(BaseModel):
    environment_id: str
    entity_name: str  # lead | opportunity | account | contact | campaign | list
    record_count: int = 0
    module: str = ""  # Sales | Marketing | BusinessCentral


class D365WorkflowHealth(BaseModel):
    environment_id: str
    workflow_name: str
    category: int = 0  # 0=Workflow, 1=Dialog, 2=BusinessRule, 3=Action, 4=BPF
    state: str = "Active"
    status: str = "Succeeded"


class D365BCStats(BaseModel):
    environment_id: str
    company_name: str
    customers_count: int = 0
    vendors_count: int = 0
    items_count: int = 0
    gl_entries_count: int = 0


class DynamicsResourceOverride(BaseModel):
    id: int
    profile_id: int
    resource_id: str
    override_status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DynamicsResourceOverrideUpsert(BaseModel):
    resource_id: str
    override_status: str
    notes: str | None = None
