from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import profiles


@pytest.mark.asyncio
async def test_create_profile_defaults_to_v2_report_version() -> None:
    db = AsyncMock()
    added: list[object] = []

    def capture(row: object) -> None:
        added.append(row)
        setattr(row, "id", 99)
        setattr(row, "created_at", datetime.now(timezone.utc))
        setattr(row, "updated_at", datetime.now(timezone.utc))

    db.add = capture

    result = await profiles.create_profile(
        profiles.CustomerProfileCreate(customer_name="Demo Customer"),
        db,
    )

    assert added
    created = added[0]
    assert getattr(created, "status") == "Cached"
    assert getattr(created, "report_version") == "v2"
    assert result.report_version == "v2"


@pytest.mark.asyncio
async def test_create_profile_rejects_invalid_report_version() -> None:
    db = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await profiles.create_profile(
            profiles.CustomerProfileCreate(customer_name="Demo Customer", report_version="future"),
            db,
        )

    assert exc_info.value.status_code == 400
    assert "report_version" in exc_info.value.detail
