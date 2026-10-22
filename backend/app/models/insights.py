"""Executive insights and data gap models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ExecutiveInsight(BaseModel):
    id: str
    category: str  # cost | security | governance | license | operations | integration
    severity: str  # high | medium | low
    title: str
    message: str
    metric_value: str | None = None
    data_source: str = ""


class DataGap(BaseModel):
    id: str
    module: str
    missing_data: str
    reason: str
    recommendation: str
    severity: str = "medium"  # high | medium | low
    timestamp: datetime | None = None
