from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class IntegrationReviewItem(BaseModel):
    id: str
    priority: str = "Medium"
    integration: str
    integration_method: str = ""
    current_understanding: str = ""
    to_confirm: str = ""
    status: str = "Not Reviewed"
    meeting_notes: str = ""


class IntegrationReviewRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    profile_id: int
    items: list[IntegrationReviewItem] = Field(default_factory=list)
    is_seeded: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class IntegrationReviewUpdate(BaseModel):
    items: list[IntegrationReviewItem] = Field(default_factory=list)
