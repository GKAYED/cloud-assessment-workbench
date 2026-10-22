from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import auth


@pytest.mark.asyncio
async def test_login_hides_raw_backend_auth_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    db.get.return_value = SimpleNamespace(id=7)

    def raise_failure(**_: object) -> None:
        raise RuntimeError("AADSTS50076: MFA required for this tenant")

    monkeypatch.setattr(auth.credential_store, "authenticate_username_password", raise_failure)

    body = auth.LoginRequest(
        profile_id=7,
        tenant_id="tenant-1",
        auth_type="user_password",
        username="user@example.com",
        password="secret",
    )

    with pytest.raises(HTTPException) as exc_info:
        await auth.login(body, db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == auth.AUTH_FAILURE_MESSAGE


@pytest.mark.asyncio
async def test_device_code_start_hides_raw_backend_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    db.get.return_value = SimpleNamespace(id=7)

    def raise_failure(**_: object) -> None:
        raise RuntimeError("tenant policy denied device code flow")

    monkeypatch.setattr(auth.credential_store, "start_device_code_flow", raise_failure)

    body = auth.DeviceCodeStartRequest(profile_id=7, tenant_id="tenant-1")

    with pytest.raises(HTTPException) as exc_info:
        await auth.device_code_start(body, db)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == auth.DEVICE_CODE_START_FAILURE_MESSAGE
