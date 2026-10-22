from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.routers import report_interpretation


@pytest.mark.asyncio
async def test_update_section_marks_previously_approved_run_as_edited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now_target = SimpleNamespace(
        run_id=1,
        section_key="executive_summary",
        edited_text=None,
        final_text="existing",
        generated_text="generated",
        source_kind="generated",
        last_edited_at=None,
        last_edited_by=None,
        updated_at=None,
    )
    current_run = SimpleNamespace(
        sections=[now_target],
        status="approved",
        approved=True,
        approved_at="2026-04-30T00:00:00Z",
        approved_by="reviewer",
        updated_at=None,
    )
    db = AsyncMock()

    async def fake_load_profile(_: object, __: int) -> SimpleNamespace:
        return SimpleNamespace(id=7)

    async def fake_load_current_run(_: object, __: int) -> SimpleNamespace:
        return current_run

    monkeypatch.setattr(report_interpretation, "_load_profile", fake_load_profile)
    monkeypatch.setattr(report_interpretation, "_load_current_run", fake_load_current_run)

    result = await report_interpretation.update_report_interpretation_section(
        7,
        "executive_summary",
        report_interpretation.ReportInterpretationSectionUpdate(text="Updated text", edited_by="local-user"),
        db,
    )

    assert current_run.status == "edited"
    assert current_run.approved is False
    assert current_run.approved_at is None
    assert current_run.approved_by is None
    assert result.final_text == "Updated text"


@pytest.mark.asyncio
async def test_build_grounding_bundle_prefers_newest_snapshot_per_module(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    newer = SimpleNamespace(
        module_name="inventory.summary",
        data_json='{"total_resources": 9}',
        snapshot_at=datetime(2026, 4, 30, 3, 0, tzinfo=timezone.utc),
    )
    older = SimpleNamespace(
        module_name="inventory.summary",
        data_json='{"total_resources": 2}',
        snapshot_at=datetime(2026, 4, 29, 3, 0, tzinfo=timezone.utc),
    )
    profile = SimpleNamespace(
        id=7,
        customer_name="Demo",
        tenant_id=None,
        tenant_display_name=None,
        report_version="v2",
    )
    db = AsyncMock()

    async def fake_load_latest_snapshot_rows(_: object, __: int):
        return [newer, older]

    async def execute_side_effect(statement):
        text = str(statement)
        if "organization_contexts" in text or "framework_manual_caf" in text:
            return SimpleNamespace(scalar_one_or_none=lambda: None)
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    db.execute.side_effect = execute_side_effect
    monkeypatch.setattr(report_interpretation, "_load_latest_snapshot_rows", fake_load_latest_snapshot_rows)

    bundle, snapshot_at = await report_interpretation._build_grounding_bundle(db, profile)

    assert snapshot_at == newer.snapshot_at
    assert bundle["evidence"]["inventory_summary"] == {"total_resources": 9}
