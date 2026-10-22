"""Customer profile and assessment snapshot Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# CustomerProfile
# ---------------------------------------------------------------------------


class CustomerProfileCreate(BaseModel):
    customer_name: str
    report_version: str | None = None


class CustomerProfileUpdate(BaseModel):
    customer_name: str | None = None
    tenant_id: str | None = None
    tenant_display_name: str | None = None
    report_version: str | None = None


class CustomerProfile(BaseModel):
    id: int
    customer_name: str
    tenant_id: str | None = None
    tenant_display_name: str | None = None
    last_assessed_at: datetime | None = None
    status: str  # Active | Cached
    report_version: str = "legacy"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerProfileList(BaseModel):
    profiles: list[CustomerProfile]


class ProfileActivateResponse(BaseModel):
    id: int
    customer_name: str
    status: str
    previous_active_profile_id: int | None = None


# ---------------------------------------------------------------------------
# AssessmentSnapshot
# ---------------------------------------------------------------------------


class SnapshotSaveRequest(BaseModel):
    modules: dict  # module_name → JSON-serializable data
    is_partial: bool = False


class SnapshotSaveResponse(BaseModel):
    profile_id: int
    snapshot_at: datetime
    modules_saved: int
    is_partial: bool


class SnapshotLoadResponse(BaseModel):
    profile_id: int
    customer_name: str
    snapshot_at: datetime | None = None
    is_partial: bool = False
    modules: dict


class SnapshotModuleResponse(BaseModel):
    profile_id: int
    module_name: str
    snapshot_at: datetime | None = None
    data: dict | list | None = None
