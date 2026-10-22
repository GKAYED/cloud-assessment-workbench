"""Cost models — CostRecord, CostRollup, CostSummary."""

from __future__ import annotations

from pydantic import BaseModel


class CostRecord(BaseModel):
    resource_id: str
    resource_name: str
    resource_type: str
    resource_group: str
    subscription_id: str
    cost_1m: float = 0.0
    cost_3m: float = 0.0
    cost_6m: float = 0.0
    currency: str = "UNKNOWN"
    trend: str = "stable"  # increasing | decreasing | stable
    monthly_avg_3m: float = 0.0
    monthly_avg_6m: float = 0.0


class CostRollup(BaseModel):
    group_key: str
    group_type: str  # subscription | resource_group | resource_type
    cost_1m: float = 0.0
    cost_3m: float = 0.0
    cost_6m: float = 0.0
    currency: str = "UNKNOWN"
    trend: str = "stable"
    resource_count: int = 0


class CostSummary(BaseModel):
    total_cost_1m: float = 0.0
    total_cost_3m: float = 0.0
    total_cost_6m: float = 0.0
    currency: str = "UNKNOWN"
    top_cost_drivers: list[CostRecord] = []
    overall_trend: str = "stable"
