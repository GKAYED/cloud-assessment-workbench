from __future__ import annotations

from types import SimpleNamespace

import pytest
import httpx

from app.routers import report_interpretation
from app.services import report_interpretation_processor as processor


@pytest.mark.asyncio
async def test_process_report_interpretation_uses_local_fallback_without_openai_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(processor.settings, "openai_api_key", "")

    result = await processor.process_report_interpretation(
        {
            "profile": {
                "id": 7,
                "customer_name": "Demo V2 Profile",
                "tenant_id": "tenant-1",
                "tenant_display_name": "Demo Tenant",
                "report_version": "v2",
            },
            "snapshot_at": "2026-04-29T00:00:00.000Z",
            "organization_context": {
                "organisation_overview": "Demo organisation overview.",
                "assessment_scope_notes": "Azure estate and delivery posture.",
                "leadership_context_notes": "Leadership wants clear sequencing.",
            },
            "manual_context": {
                "manual_caf_ratings": {},
                "challenges": [{"title": "Capacity drag", "impact_level": "High"}],
                "recommendations": [{"title": "Improve Defender posture", "priority": "P1"}],
                "initiatives": [{"name": "Cleanup backlog", "status": "Planned"}],
                "stakeholder_notes": [],
            },
            "evidence": {
                "inventory_summary": {
                    "total_resources": 5,
                    "total_resource_groups": 2,
                    "total_subscriptions": 1,
                },
                "cost_summary": {
                    "total": 135,
                },
                "framework_insights": {
                    "caf_average_maturity": 2.8,
                },
                "defender_scores": {
                    "overall_percentage": 38.5,
                },
            },
        }
    )

    assert result["generation_model"] == "local-fallback"
    assert len(result["sections"]) == len(processor.SECTION_KEYS)
    assert [item["section_key"] for item in result["sections"]] == processor.SECTION_KEYS
    assert "saved profile snapshot" in result["sections"][0]["text"]


def test_manual_caf_ratings_json_treats_invalid_payload_as_empty() -> None:
    row = SimpleNamespace(ratings_json="{not-valid-json")

    assert report_interpretation._manual_caf_ratings_json(row) == {}


def test_manual_caf_ratings_json_keeps_valid_dict_payload() -> None:
    row = SimpleNamespace(ratings_json='{"Policy": {"Tagging": "green"}}')

    assert report_interpretation._manual_caf_ratings_json(row) == {"Policy": {"Tagging": "green"}}


@pytest.mark.asyncio
async def test_process_report_interpretation_falls_back_on_httpx_transport_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(processor.settings, "openai_api_key", "configured-key")

    class FailingClient:
        async def __aenter__(self) -> "FailingClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, *args, **kwargs):
            raise httpx.ConnectError("network down")

    monkeypatch.setattr(processor.httpx, "AsyncClient", lambda **_: FailingClient())

    result = await processor.process_report_interpretation(
        {
            "profile": {
                "id": 7,
                "customer_name": "Demo V2 Profile",
                "tenant_id": "tenant-1",
                "tenant_display_name": "Demo Tenant",
                "report_version": "v2",
            },
            "snapshot_at": "2026-04-29T00:00:00.000Z",
            "organization_context": {},
            "manual_context": {
                "manual_caf_ratings": {},
                "challenges": [],
                "recommendations": [],
                "initiatives": [],
                "stakeholder_notes": [],
            },
            "evidence": {
                "inventory_summary": {
                    "total_resources": 5,
                    "total_resource_groups": 2,
                    "total_subscriptions": 1,
                },
                "cost_summary": {
                    "total": 135,
                },
                "framework_insights": {
                    "caf_average_maturity": 2.8,
                },
                "defender_scores": {
                    "overall_percentage": 38.5,
                },
            },
        }
    )

    assert result["generation_model"] == "local-fallback"
    assert "request failed" in result["generation_notes"]


@pytest.mark.asyncio
async def test_process_report_interpretation_falls_back_on_non_json_success_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(processor.settings, "openai_api_key", "configured-key")

    class NonJsonResponse:
        status_code = 200

        def json(self):
            raise ValueError("not json")

    class NonJsonClient:
        async def __aenter__(self) -> "NonJsonClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, *args, **kwargs):
            return NonJsonResponse()

    monkeypatch.setattr(processor.httpx, "AsyncClient", lambda **_: NonJsonClient())

    result = await processor.process_report_interpretation(
        {
            "profile": {
                "id": 7,
                "customer_name": "Demo V2 Profile",
                "tenant_id": "tenant-1",
                "tenant_display_name": "Demo Tenant",
                "report_version": "v2",
            },
            "snapshot_at": "2026-04-29T00:00:00.000Z",
            "organization_context": {},
            "manual_context": {
                "manual_caf_ratings": {},
                "challenges": [],
                "recommendations": [],
                "initiatives": [],
                "stakeholder_notes": [],
            },
            "evidence": {
                "inventory_summary": {
                    "total_resources": 5,
                    "total_resource_groups": 2,
                    "total_subscriptions": 1,
                },
                "cost_summary": {
                    "total": 135,
                },
                "framework_insights": {
                    "caf_average_maturity": 2.8,
                },
                "defender_scores": {
                    "overall_percentage": 38.5,
                },
            },
        }
    )

    assert result["generation_model"] == "local-fallback"
    assert "non-JSON response" in result["generation_notes"]
