from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReportSettings(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    profile_id: int
    visible_sections: dict[str, bool] = Field(default_factory=dict)
    appendix_sections: dict[str, bool] = Field(default_factory=dict)
    release_mode: str = "draft"
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ReportSettingsUpdate(BaseModel):
    visible_sections: dict[str, bool] = Field(default_factory=dict)
    appendix_sections: dict[str, bool] = Field(default_factory=dict)
    release_mode: str = "draft"
