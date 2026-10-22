"""License models — LicenseSKU, UserLicense."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class LicenseSKU(BaseModel):
    sku_id: str
    sku_part_number: str
    sku_display_name: str = ""
    purchased: int = 0
    consumed: int = 0
    available: int = 0
    utilization_pct: float = 0.0
    is_underutilized: bool = False


class UserLicense(BaseModel):
    user_id: str
    display_name: str
    user_principal_name: str = ""
    assigned_licenses: list[str] = []
    last_sign_in: datetime | None = None
    is_inactive_30d: bool = False
    estimated_monthly_cost: float = 0.0


class LicenseSummary(BaseModel):
    total_skus: int = 0
    total_purchased: int = 0
    total_consumed: int = 0
    total_available: int = 0
    overall_utilization_pct: float = 0.0
    underutilized_skus: list[LicenseSKU] = []
    inactive_licensed_users: int = 0
    estimated_waste_monthly: float = 0.0
