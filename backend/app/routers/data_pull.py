"""Data Pull router — atomic all-or-nothing assessment data fetch with SSE progress.

Architecture:
- Calls each backend API endpoint sequentially via internal HTTP (localhost).
- Stages ALL results in memory.
- Only commits to the database when EVERY step succeeds (zero failures).
- Progress is streamed to the frontend in real-time via Server-Sent Events.
- If any step fails the staged data is discarded — the previous successful
  pull in the database remains intact.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AssessmentSnapshotDB, CustomerProfileDB, async_session
from app.dependencies import get_db
from app.local_session import valid_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/data-pull", tags=["data-pull"])


# ---------------------------------------------------------------------------
# Pull step definitions
# ---------------------------------------------------------------------------


@dataclass
class PullStep:
    """One data-fetch step within the pull."""

    name: str  # Human-readable label shown in the UI
    module_key: str  # Key used in assessment_snapshots.module_name & frontend cache
    endpoint: str | None = None  # Backend REST endpoint (GET) for source/diagnostic steps
    step_type: Literal["source", "diagnostic", "derived"] = "source"


# The order here determines the execution order.
# Source-backed modules are pulled first, then persisted data gaps are captured,
# then derived modules are built from the staged source payloads only.
PULL_STEPS: list[PullStep] = [
    # ── Inventory ────────────────────────────────────────────────
    PullStep("Inventory summary", "inventory.summary", "/api/inventory/summary"),
    PullStep("Inventory resources", "inventory.resources", "/api/inventory/resources"),
    PullStep("Inventory tree", "inventory.tree", "/api/inventory/tree"),
    PullStep("Inventory databases", "inventory.databases", "/api/inventory/databases"),
    PullStep("Inventory subscriptions", "inventory.subscriptions", "/api/inventory/subscriptions"),
    PullStep("Inventory resource groups", "inventory.resource_groups", "/api/inventory/resource-groups"),
    # ── Costs ────────────────────────────────────────────────────
    PullStep("Cost summary", "cost.summary", "/api/costs/summary"),
    PullStep("Cost by subscription", "cost.by_subscription", "/api/costs/by-subscription"),
    PullStep("Cost by resource", "cost.by_resource", "/api/costs/by-resource"),
    PullStep("Cost by resource group", "cost.by_resource_group", "/api/costs/by-resource-group"),
    PullStep("Cost by resource type", "cost.by_resource_type", "/api/costs/by-resource-type"),
    # ── Security ─────────────────────────────────────────────────
    PullStep("Defender scores", "security.defender_scores", "/api/security/defender-scores"),
    PullStep("Advisor scores", "security.advisor_scores", "/api/security/advisor-scores"),
    PullStep("Advisor recommendations", "security.advisor_recommendations", "/api/security/advisor-recommendations"),
    PullStep("CSPM insights", "security.cspm_insights", "/api/security/cspm-insights"),
    # ── Integrations ─────────────────────────────────────────────
    PullStep("Integrations list", "integrations.list", "/api/integrations"),
    PullStep("Integrations summary", "integrations.summary", "/api/integrations/summary"),
    PullStep("Integrations recommendations", "integrations.recommendations", "/api/integrations/recommendations"),
    # ── Dynamics 365 ─────────────────────────────────────────────
    PullStep("Dynamics environments", "dynamics.environments.v3", "/api/dynamics/environments"),
    PullStep("Dynamics users", "dynamics.users.v3", "/api/dynamics/users"),
    PullStep("Dynamics module stats", "dynamics.module_stats.v3", "/api/dynamics/module-stats"),
    PullStep("Dynamics workflow health", "dynamics.workflow_health.v3", "/api/dynamics/workflow-health"),
    PullStep("Dynamics BC stats", "dynamics.bc_stats.v3", "/api/dynamics/bc-stats"),
    # ── Licenses ─────────────────────────────────────────────────
    PullStep("License SKUs", "licenses.skus.v3", "/api/licenses/skus"),
    PullStep("Licensed users", "licenses.users.v3", "/api/licenses/users"),
    PullStep("License summary", "licenses.summary.v3", "/api/licenses/summary"),
    # ── Governance ───────────────────────────────────────────────
    PullStep("Governance policy compliance", "governance.policy_compliance", "/api/governance/policy-compliance"),
    PullStep("Governance RBAC", "governance.role_assignments", "/api/governance/role-assignments"),
    PullStep("Governance orphaned resources", "governance.orphaned_resources", "/api/governance/orphaned-resources"),
    # ── Data gaps (collected from all prior calls) ───────────────
    PullStep("Data gaps", "data_gaps.list", "/api/data-gaps", "diagnostic"),
    # ── Derived modules (built from staged source data only) ─────
    PullStep("Insights", "insights.list", step_type="derived"),
    PullStep("Framework assessment", "framework.insights", step_type="derived"),
]

_SOURCE_MODULE_KEYS = {
    step.module_key
    for step in PULL_STEPS
    if step.step_type == "source"
}


def _staged_dict(staged: dict[str, object], module_key: str) -> dict[str, Any]:
    value = staged.get(module_key)
    return value if isinstance(value, dict) else {}


def _staged_list(staged: dict[str, object], module_key: str) -> list[dict[str, Any]]:
    value = staged.get(module_key)
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _workflow_counts(workflows: list[dict[str, Any]]) -> tuple[int, int]:
    active = 0
    for workflow in workflows:
        state = str(workflow.get("state") or workflow.get("status") or "").lower()
        if state in {"active", "running", "enabled"}:
            active += 1
    return active, max(len(workflows) - active, 0)


def _build_insight_module_data(staged: dict[str, object]) -> dict[str, Any]:
    advisor_recommendations = _staged_list(staged, "security.advisor_recommendations")
    integrations = _staged_list(staged, "integrations.list")
    integration_recommendations = _staged_list(staged, "integrations.recommendations")
    environments = _staged_list(staged, "dynamics.environments.v3")
    workflows = _staged_list(staged, "dynamics.workflow_health.v3")
    active_workflows, inactive_workflows = _workflow_counts(workflows)
    data_gaps_payload = _staged_dict(staged, "data_gaps.list")

    return {
        "costs": _staged_dict(staged, "cost.summary"),
        "advisor": {
            "recommendations": advisor_recommendations,
            "total_count": len(advisor_recommendations),
        },
        "security": _staged_dict(staged, "security.defender_scores"),
        "inventory": _staged_dict(staged, "inventory.summary"),
        "integrations": {
            "integrations": integrations,
            "total_count": len(integrations),
        },
        "integration_recommendations": {
            "recommendations": integration_recommendations,
            "total_count": len(integration_recommendations),
        },
        "licenses": _staged_dict(staged, "licenses.summary.v3"),
        "dynamics_environments": {
            "environments": environments,
            "total_count": len(environments),
        },
        "dynamics_workflows": {
            "workflows": workflows,
            "total_count": len(workflows),
            "active_count": active_workflows,
            "inactive_count": inactive_workflows,
        },
        "dynamics": {
            "environments": {"environments": environments, "total_count": len(environments)},
            "workflows": {
                "workflows": workflows,
                "total_count": len(workflows),
                "active_count": active_workflows,
                "inactive_count": inactive_workflows,
            },
            "environment_count": len(environments),
            "workflow_count": len(workflows),
            "active_workflows": active_workflows,
            "inactive_workflows": inactive_workflows,
        },
        "data_gaps": data_gaps_payload.get("gaps", []),
    }


async def _build_framework_module_data(
    staged: dict[str, object],
    profile_id: int,
) -> dict[str, Any]:
    from sqlalchemy import select

    from app.db import AppPortfolioEntryDB, InitiativeDB

    module_data = _build_insight_module_data(staged)
    module_data["advisor_scores"] = _staged_dict(staged, "security.advisor_scores")
    module_data["advisor_recommendations"] = _staged_list(staged, "security.advisor_recommendations")
    module_data["policy_compliance"] = _staged_dict(staged, "governance.policy_compliance")
    module_data["role_assignments"] = _staged_dict(staged, "governance.role_assignments")
    module_data["orphaned_resources"] = _staged_dict(staged, "governance.orphaned_resources")

    async with async_session() as session:
        portfolio_rows = (
            await session.execute(
                select(AppPortfolioEntryDB).where(AppPortfolioEntryDB.profile_id == profile_id)
            )
        ).scalars().all()
        initiative_rows = (
            await session.execute(
                select(InitiativeDB).where(InitiativeDB.profile_id == profile_id)
            )
        ).scalars().all()

    module_data["portfolio"] = [
        {
            "id": row.id,
            "app_name": row.app_name,
            "purpose": row.purpose,
            "business_owner": row.business_owner,
            "technical_owner": row.technical_owner,
            "current_hosting": row.current_hosting,
            "status": row.status,
            "criticality": row.criticality,
            "business_value": row.business_value,
            "technical_fitness": row.technical_fitness,
            "complexity": row.complexity,
            "strategic_fit": row.strategic_fit,
            "time_classification": row.time_classification,
            "future_state": row.future_state,
            "known_risks": row.known_risks,
        }
        for row in portfolio_rows
    ]
    module_data["initiatives"] = [
        {
            "id": row.id,
            "name": row.name,
            "description": row.description,
            "status": row.status,
            "priority": row.priority,
            "complexity": row.complexity,
            "strategic_fit": row.strategic_fit,
            "target_quarter": row.target_quarter,
            "category": row.category,
            "business_owner": row.business_owner,
            "technical_owner": row.technical_owner,
            "validation_status": row.validation_status,
            "evidence_confidence": row.evidence_confidence,
        }
        for row in initiative_rows
    ]
    return module_data


async def _build_derived_payload(
    step: PullStep,
    staged: dict[str, object],
    profile_id: int,
) -> object:
    if step.module_key == "insights.list":
        from app.services.insight_engine import generate_insights

        return generate_insights(_build_insight_module_data(staged))

    if step.module_key == "framework.insights":
        from app.services.waf_caf_engine import generate_framework_assessment

        return generate_framework_assessment(
            await _build_framework_module_data(staged, profile_id)
        )

    raise ValueError(f"Unsupported derived module: {step.module_key}")


# ---------------------------------------------------------------------------
# Auth-failure detection (mirrored from frontend dataPull.ts)
# ---------------------------------------------------------------------------

_AUTH_PATTERNS = [
    "profile session is not authenticated",
    "session may have expired",
    "token acquisition failed",
    "illegal header value",
    "re-authenticate",
    "reconnect",
]


def _has_auth_failure(data: object) -> bool:
    """Return True if *data* contains data-gap entries that signal auth issues."""
    if not isinstance(data, dict):
        return False
    gaps = data.get("data_gaps")
    if not isinstance(gaps, list):
        return False
    for gap in gaps:
        if not isinstance(gap, dict):
            continue
        for key in ("reason", "recommendation", "remediation"):
            val = gap.get(key)
            if isinstance(val, str):
                lower = val.lower()
                if any(p in lower for p in _AUTH_PATTERNS):
                    return True
    return False


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def _sse(event: str, data: dict) -> str:
    """Format one Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Core pull orchestrator (async generator → SSE stream)
# ---------------------------------------------------------------------------


async def _run_pull(profile_id: int, base_url: str, session_token: str) -> AsyncGenerator[str, None]:
    """Execute the full data pull, yielding SSE events for each step."""

    total = len(PULL_STEPS)
    staged: dict[str, object] = {}  # module_key → parsed JSON payload
    failed_steps: list[dict] = []  # [{name, error}]
    source_failures = 0

    # Pre-flight: verify credential exists
    try:
        from app.services.credential_store import get_credential as _store_get
        if _store_get(profile_id) is None:
            yield _sse("error", {
                "message": (
                    "Profile is not authenticated. "
                    "Please connect from the Profiles page before pulling."
                ),
            })
            return
    except Exception:
        yield _sse("error", {"message": "Unable to verify cloud authentication."})
        return

    # Build the step manifest so the frontend can render the full list immediately
    step_manifest = [{"name": s.name, "module_key": s.module_key} for s in PULL_STEPS]

    yield _sse("start", {
        "total_steps": total,
        "profile_id": profile_id,
        "steps": step_manifest,
    })

    # Best-effort: clear stale data gaps for this profile
    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as gap_client:
        try:
            await gap_client.delete(
                "/api/data-gaps",
                headers={"X-Profile-Id": str(profile_id), "X-Workbench-Session": session_token},
            )
        except Exception:
            pass

    # ── Sequential fetch loop ────────────────────────────────────
    async with httpx.AsyncClient(base_url=base_url, timeout=480.0) as client:
        for idx, step in enumerate(PULL_STEPS):
            step_num = idx + 1

            # Announce: step starting
            yield _sse("progress", {
                "step": step_num,
                "total": total,
                "name": step.name,
                "module_key": step.module_key,
                "status": "fetching",
            })

            try:
                if step.step_type == "derived":
                    if source_failures > 0:
                        err = "Skipped because one or more source modules failed earlier in the pull."
                        failed_steps.append({"name": step.name, "error": err})
                        yield _sse("progress", {
                            "step": step_num,
                            "total": total,
                            "name": step.name,
                            "module_key": step.module_key,
                            "status": "failed",
                            "error": err,
                        })
                        continue

                    payload = await _build_derived_payload(step, staged, profile_id)
                    staged[step.module_key] = payload

                    yield _sse("progress", {
                        "step": step_num,
                        "total": total,
                        "name": step.name,
                        "module_key": step.module_key,
                        "status": "success",
                    })
                    continue

                if not step.endpoint:
                    raise RuntimeError(f"Pull step {step.name} has no endpoint configured.")

                resp = await client.get(
                    step.endpoint,
                    headers={"X-Profile-Id": str(profile_id), "X-Workbench-Session": session_token},
                )

                if resp.status_code >= 400:
                    # Extract a useful error message
                    try:
                        err_body = resp.json()
                        error_detail = err_body.get("detail", f"HTTP {resp.status_code}")
                    except Exception:
                        error_detail = f"HTTP {resp.status_code}"

                    failed_steps.append({"name": step.name, "error": error_detail})
                    if step.module_key in _SOURCE_MODULE_KEYS:
                        source_failures += 1
                    yield _sse("progress", {
                        "step": step_num,
                        "total": total,
                        "name": step.name,
                        "module_key": step.module_key,
                        "status": "failed",
                        "error": error_detail,
                    })
                    continue

                payload = resp.json()

                # Check response for auth-failure gaps
                if _has_auth_failure(payload):
                    err_msg = "Authentication expired — reconnect before pulling."
                    failed_steps.append({"name": step.name, "error": err_msg})
                    if step.module_key in _SOURCE_MODULE_KEYS:
                        source_failures += 1
                    yield _sse("progress", {
                        "step": step_num,
                        "total": total,
                        "name": step.name,
                        "module_key": step.module_key,
                        "status": "failed",
                        "error": err_msg,
                    })
                    continue

                # ✓ Step succeeded — stage the data
                staged[step.module_key] = payload

                yield _sse("progress", {
                    "step": step_num,
                    "total": total,
                    "name": step.name,
                    "module_key": step.module_key,
                    "status": "success",
                })

            except httpx.TimeoutException:
                err = f"Timed out after {int(client.timeout.read or 480)}s"
                failed_steps.append({"name": step.name, "error": err})
                if step.module_key in _SOURCE_MODULE_KEYS:
                    source_failures += 1
                yield _sse("progress", {
                    "step": step_num,
                    "total": total,
                    "name": step.name,
                    "module_key": step.module_key,
                    "status": "failed",
                    "error": err,
                })

            except Exception as exc:
                err = str(exc) or "Unknown error"
                failed_steps.append({"name": step.name, "error": err})
                if step.module_key in _SOURCE_MODULE_KEYS:
                    source_failures += 1
                yield _sse("progress", {
                    "step": step_num,
                    "total": total,
                    "name": step.name,
                    "module_key": step.module_key,
                    "status": "failed",
                    "error": err,
                })

    # ── Decide: commit or reject ─────────────────────────────────
    success_count = total - len(failed_steps)

    if not failed_steps:
        if not valid_session(session_token):
            yield _sse("error", {"message": "Local session ended; previous snapshot preserved."})
            return
        # ALL steps succeeded → atomic write to database
        try:
            now = datetime.now(timezone.utc)

            async with async_session() as session:
                # 1. Delete all existing snapshots for this profile
                await session.execute(
                    delete(AssessmentSnapshotDB).where(
                        AssessmentSnapshotDB.profile_id == profile_id,
                    )
                )

                # 2. Insert every staged module as a new snapshot row
                for module_key, data in staged.items():
                    session.add(AssessmentSnapshotDB(
                        profile_id=profile_id,
                        module_name=module_key,
                        data_json=json.dumps(data),
                        snapshot_at=now,
                        is_partial=False,
                    ))

                # 3. Update profile timestamp
                profile = await session.get(CustomerProfileDB, profile_id)
                if profile:
                    profile.last_assessed_at = now
                    profile.updated_at = now

                await session.commit()

            logger.info(
                "Data pull committed: profile=%s modules=%s at=%s",
                profile_id, len(staged), now.isoformat(),
            )

            yield _sse("complete", {
                "total": total,
                "success": success_count,
                "failed": 0,
                "committed": True,
                "snapshot_at": now.isoformat(),
            })

        except Exception as exc:
            logger.exception("Data pull DB commit failed for profile %s", profile_id)
            yield _sse("error", {
                "message": f"All modules succeeded but database commit failed: {exc}",
            })
    else:
        # Some steps failed → reject entire pull, keep old data
        logger.warning(
            "Data pull rejected: profile=%s success=%s failed=%s",
            profile_id, success_count, len(failed_steps),
        )
        yield _sse("failed", {
            "total": total,
            "success": success_count,
            "failed": len(failed_steps),
            "failed_steps": failed_steps,
            "committed": False,
        })


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stream/{profile_id}")
async def stream_data_pull(profile_id: int, request: Request):
    """Stream data-pull progress via Server-Sent Events.

    The response is a text/event-stream that emits:
      - ``start``    — total step count + full step manifest
      - ``progress`` — per-step status (fetching → success | failed)
      - ``complete`` — all steps succeeded, data committed
      - ``failed``   — at least one step failed, data NOT committed
      - ``error``    — pre-flight or internal error
    """
    from app.config import settings

    base_url = f"http://127.0.0.1:{settings.port}"

    return StreamingResponse(
        _run_pull(profile_id, base_url, request.headers.get("x-workbench-session", "")),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # prevent nginx/proxy buffering
        },
    )


@router.delete("/wipe/{profile_id}")
async def wipe_pull_data(profile_id: int, db: AsyncSession = Depends(get_db)):
    """Delete ALL assessment snapshots for a profile — reset to blank state."""
    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    result = await db.execute(
        delete(AssessmentSnapshotDB).where(
            AssessmentSnapshotDB.profile_id == profile_id,
        )
    )

    profile.last_assessed_at = None
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "profile_id": profile_id,
        "modules_deleted": result.rowcount,  # type: ignore[union-attr]
        "status": "wiped",
    }


@router.get("/last/{profile_id}")
async def get_last_pull_info(profile_id: int, db: AsyncSession = Depends(get_db)):
    """Return metadata about the most recent successful pull (if any)."""
    from sqlalchemy import select, func

    profile = await db.get(CustomerProfileDB, profile_id)
    if not profile:
        raise HTTPException(404, detail="Profile not found")

    # Count modules and find latest timestamp
    result = await db.execute(
        select(
            func.count(AssessmentSnapshotDB.id),
            func.max(AssessmentSnapshotDB.snapshot_at),
        ).where(AssessmentSnapshotDB.profile_id == profile_id)
    )
    row = result.one()
    module_count = row[0] or 0
    latest_at = row[1]

    return {
        "profile_id": profile_id,
        "has_data": module_count > 0,
        "module_count": module_count,
        "snapshot_at": latest_at.isoformat() if latest_at else None,
        "expected_modules": len(PULL_STEPS),
    }
