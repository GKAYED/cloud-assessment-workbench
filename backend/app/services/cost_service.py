"""Cost service — Azure Cost Management queries.

Uses the Cost Management REST API (per-subscription scope) with
1/3/6 month windows, grouping, and trend calculation.
"""

from __future__ import annotations

import logging
import hashlib
import time
import random
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.services.azure_auth import StaticTokenCredential, extract_bearer_token_async
from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

MANAGEMENT_URL = "https://management.azure.com"
COST_API_VERSION = "2023-11-01"
SUB_LIST_TIMEOUT_SEC = 20
HTTP_QUERY_TIMEOUT_SEC = 60
PER_SUB_QUERY_TIMEOUT_SEC = 75
CONCURRENT_SUB_QUERIES = 1
TRANSIENT_RETRY_ATTEMPTS = 4
MAX_BACKOFF_SEC = 12.0
COST_RESOURCE_CACHE_TTL_SEC = 900

_cost_resource_cache: dict[str, tuple[float, dict[str, Any]]] = {}



def _cache_key_for_token(token: str) -> str:
    return hashlib.sha1(token.encode("utf-8")).hexdigest()


def _get_cached_cost_resource_payload(token: str) -> dict[str, Any] | None:
    key = _cache_key_for_token(token)
    cached = _cost_resource_cache.get(key)
    if not cached:
        return None
    saved_at, payload = cached
    if (time.time() - saved_at) > COST_RESOURCE_CACHE_TTL_SEC:
        _cost_resource_cache.pop(key, None)
        return None
    return payload


def _set_cached_cost_resource_payload(token: str, payload: dict[str, Any]) -> None:
    key = _cache_key_for_token(token)
    _cost_resource_cache[key] = (time.time(), payload)


def _extract_currency_from_rows(*row_sets: list[dict[str, Any]]) -> str:
    """Best-effort currency detection from Cost Management row payloads."""
    seen: set[str] = set()
    for rows in row_sets:
        for row in rows:
            for key in ("Currency", "BillingCurrency", "currency"):
                value = str(row.get(key) or "").strip().upper()
                if value:
                    seen.add(value)
    if len(seen) == 1:
        return next(iter(seen))
    if len(seen) > 1:
        return sorted(seen)[0]
    return "UNKNOWN"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _date_range(months: int) -> tuple[str, str]:
    """Return (from, to) for the previous N full calendar months."""
    today = datetime.utcnow().date()
    end = today.replace(day=1) - timedelta(days=1)  # last day of previous month
    start = end.replace(day=1)
    for _ in range(months - 1):
        start = (start - timedelta(days=1)).replace(day=1)
    return start.isoformat(), end.isoformat()


def _trend_date_range(months: int) -> tuple[str, str]:
    """Return (from, to) for previous full months plus current month-to-date."""
    today = datetime.utcnow().date()
    start = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    for _ in range(months - 1):
        start = (start - timedelta(days=1)).replace(day=1)
    return start.isoformat(), today.isoformat()


def _retry_delay(attempt: int, retry_after_header: str | None = None) -> float:
    if retry_after_header:
        try:
            retry_after = float(retry_after_header)
            if retry_after > 0:
                return min(retry_after, MAX_BACKOFF_SEC)
        except ValueError:
            pass
    base = min(4 * (2 ** max(attempt - 1, 0)), MAX_BACKOFF_SEC)
    jitter = random.uniform(0.1, 0.75)
    return min(base + jitter, MAX_BACKOFF_SEC)


def _should_retry_http_error(exc: Exception) -> tuple[bool, float]:
    if isinstance(exc, httpx.TimeoutException):
        return True, 0.0
    if isinstance(exc, httpx.TransportError):
        return True, 0.0
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in {429, 502, 503, 504}:
            retry_after = exc.response.headers.get("Retry-After")
            return True, _retry_delay(1, retry_after)
    return False, 0.0


async def _request_json_with_retries(
    *,
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import asyncio

    last_exc: Exception | None = None
    for attempt in range(1, TRANSIENT_RETRY_ATTEMPTS + 1):
        try:
            response = await client.request(method, url, headers=headers, json=json_body)
            if response.status_code == 404:
                return {"__status__": 404}
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            should_retry, header_delay = _should_retry_http_error(exc)
            if not should_retry or attempt == TRANSIENT_RETRY_ATTEMPTS:
                raise
            delay = header_delay or _retry_delay(attempt, getattr(getattr(exc, "response", None), "headers", {}).get("Retry-After") if isinstance(exc, httpx.HTTPStatusError) else None)
            logger.warning("Retrying cost request (%s/%s) after %.1fs due to: %s", attempt, TRANSIENT_RETRY_ATTEMPTS, delay, exc)
            await asyncio.sleep(delay)
            last_exc = exc
    if last_exc:
        raise last_exc
    raise RuntimeError("Cost request failed without a captured exception.")


async def _get_subscription_ids(token: str) -> list[str]:
    """Retrieve enabled subscription IDs."""
    url = f"{MANAGEMENT_URL}/subscriptions?api-version=2022-09-01"
    async with httpx.AsyncClient(timeout=SUB_LIST_TIMEOUT_SEC) as client:
        data = await _request_json_with_retries(
            client=client,
            method="GET",
            url=url,
            headers={"Authorization": f"Bearer {token}"},
        )
        return [s["subscriptionId"] for s in data.get("value", []) if s.get("state") == "Enabled"]


async def _cost_query(
    token: str,
    subscription_id: str,
    from_date: str,
    to_date: str,
    grouping: list[dict] | None = None,
) -> list[dict]:
    """Execute a Cost Management query for a single subscription."""
    url = (
        f"{MANAGEMENT_URL}/subscriptions/{subscription_id}"
        f"/providers/Microsoft.CostManagement/query?api-version={COST_API_VERSION}"
    )
    body: dict[str, Any] = {
        "type": "ActualCost",
        "timeframe": "Custom",
        "timePeriod": {"from": from_date, "to": to_date},
        "dataset": {
            "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
            "granularity": "None",
        },
    }
    if grouping:
        body["dataset"]["grouping"] = grouping

    all_rows: list[list] = []
    columns: list[dict] = []
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=HTTP_QUERY_TIMEOUT_SEC) as client:
        while True:
            data = await _request_json_with_retries(
                client=client,
                method="POST",
                url=url,
                headers=headers,
                json_body=body,
            )
            if data.get("__status__") == 404:
                return []
            props = data.get("properties", data)
            if not columns:
                columns = props.get("columns", [])
            all_rows.extend(props.get("rows", []))
            next_link = props.get("nextLink")
            if not next_link:
                break
            url = next_link
            body = {}  # nextLink includes query params

    # Convert rows to dicts
    col_names = [c["name"] for c in columns]
    return [dict(zip(col_names, row)) for row in all_rows]


async def _query_all_subs(
    token: str,
    from_date: str,
    to_date: str,
    grouping: list[dict] | None = None,
    gaps: DataGapCollector | None = None,
    sub_ids: list[str] | None = None,
) -> list[dict]:
    """Run cost query across all subscriptions concurrently with per-sub timeout.

    Uses asyncio.gather so slow / unreachable subscriptions don't block the rest.
    Each individual subscription query is capped at 30s.
    """
    import asyncio as _aio

    if sub_ids is None:
        sub_ids = await _get_subscription_ids(token)
    if not sub_ids:
        return []
    semaphore = _aio.Semaphore(CONCURRENT_SUB_QUERIES)

    async def _safe_query(sub_id: str) -> list[dict]:
        for attempt in range(3):
            try:
                async with semaphore:
                    rows = await _aio.wait_for(
                        _cost_query(token, sub_id, from_date, to_date, grouping),
                        timeout=PER_SUB_QUERY_TIMEOUT_SEC,
                    )
                for r in rows:
                    r["subscription_id"] = sub_id
                return rows
            except _aio.TimeoutError:
                if attempt < 2:
                    await _aio.sleep(_retry_delay(attempt + 1))
                    continue
                logger.warning("Cost query timed out (%ss) for subscription %s", PER_SUB_QUERY_TIMEOUT_SEC, sub_id)
                if gaps:
                    gaps.add_gap(
                        module="Costs",
                        field=f"subscription_{sub_id}",
                        reason=f"Cost query timed out for subscription {sub_id}",
                        severity="medium",
                        remediation=f"Cost Management API was slow for {sub_id}. Data may appear on retry.",
                    )
                return []
            except Exception as exc:
                logger.warning("Cost query failed for subscription %s: %s", sub_id, exc)
                if gaps:
                    gaps.add_gap(
                        module="Costs",
                        field=f"subscription_{sub_id}",
                        reason=format_gap_reason(exc, f"Cost data unavailable for subscription {sub_id}"),
                        severity="medium",
                        remediation=f"Ensure Cost Management access on subscription {sub_id}.",
                    )
                return []
        return []

    results = await _aio.gather(*[_safe_query(sid) for sid in sub_ids])
    return [row for sub_rows in results for row in sub_rows]


def _compute_trend(current: float, previous: float) -> str:
    """Simple trend classification."""
    if previous == 0:
        return "stable" if current == 0 else "increasing"
    pct = ((current - previous) / abs(previous)) * 100
    if pct > 5:
        return "increasing"
    elif pct < -5:
        return "decreasing"
    return "stable"


def _resource_group_from_resource_id(resource_id: str) -> str:
    rid = str(resource_id or "").strip()
    if not rid:
        return ""
    marker = "/resourcegroups/"
    rid_lower = rid.lower()
    idx = rid_lower.find(marker)
    if idx == -1:
        return ""
    after = rid[idx + len(marker):]
    return after.split("/")[0].strip()


def _extract_resource_group(row: dict[str, Any], resource_id: str) -> str:
    for key in ("ResourceGroupName", "ResourceGroup"):
        value = str(row.get(key) or "").strip()
        if value and value.lower() not in {"unknown", "n/a", "none", "null"}:
            return value
    return _resource_group_from_resource_id(resource_id)


def _build_resource_identity(row: dict[str, Any]) -> tuple[str, str, str, str]:
    subscription_id = str(row.get("subscription_id") or "").strip()
    resource_id = str(row.get("ResourceId") or "").strip()
    resource_type = str(row.get("ResourceType") or "").strip()
    resource_group = _extract_resource_group(row, resource_id)

    if not resource_id:
        fallback_name = (
            str(row.get("ResourceName") or "")
            or str(row.get("ServiceName") or "")
            or str(row.get("MeterCategory") or "")
            or resource_type
            or "unattributed"
        ).strip()
        safe_name = fallback_name.replace("/", "-")
        if resource_group:
            resource_id = (
                f"/subscriptions/{subscription_id}/resourceGroups/{resource_group}"
                f"/providers/Microsoft.CostManagement/unattributed/{safe_name}"
            )
        else:
            resource_id = (
                f"/subscriptions/{subscription_id}"
                f"/providers/Microsoft.CostManagement/unattributed/{safe_name}"
            )

    return subscription_id, resource_id, resource_group, resource_type


def _aggregate_rollups_from_resource_costs(costs: list[dict], group_type: str) -> list[dict]:
    """Aggregate rollups from the already-computed per-resource payload."""
    aggregates: dict[str, dict[str, float | str]] = {}
    resource_ids: dict[str, set] = {}
    aggregate_currency = "UNKNOWN"
    for row in costs:
        row_currency = str(row.get("currency") or "").strip().upper()
        if row_currency and aggregate_currency == "UNKNOWN":
            aggregate_currency = row_currency
        subscription_id = str(row.get("subscription_id") or "")
        resource_id = str(row.get("resource_id") or "")
        resource_group = str(row.get("resource_group") or "").strip() or _resource_group_from_resource_id(resource_id)
        resource_type = str(row.get("resource_type") or "")

        if group_type == "subscription":
            key = subscription_id or "unknown"
        elif group_type == "resource_type":
            key = resource_type or "Unknown"
        else:
            # Resource-group rollups should show only real RG names.
            if not resource_group or resource_group.lower() in {"unknown", "n/a", "none", "null"}:
                continue
            key = f"{subscription_id}::{resource_group}"

        slot = aggregates.setdefault(key, {"c1": 0.0, "c3": 0.0, "c6": 0.0})
        slot["c1"] = float(slot["c1"]) + float(row.get("cost_1m") or 0)
        slot["c3"] = float(slot["c3"]) + float(row.get("cost_3m") or 0)
        slot["c6"] = float(slot["c6"]) + float(row.get("cost_6m") or 0)
        resource_ids.setdefault(key, set()).add(resource_id)

    rollups: list[dict[str, Any]] = []
    for key, vals in aggregates.items():
        c1 = float(vals["c1"])
        c3 = float(vals["c3"])
        c6 = float(vals["c6"])
        out: dict[str, Any] = {
            "group_key": key,
            "group_type": group_type,
            "cost_1m": round(c1, 2),
            "cost_3m": round(c3, 2),
            "cost_6m": round(c6, 2),
            "currency": aggregate_currency,
            "trend": _compute_trend(c1, c3 / 3 if c3 else 0),
            "resource_count": len(resource_ids.get(key, set())),
        }
        if group_type == "resource_group":
            sid, _, rg_name = key.partition("::")
            out["subscription_id"] = sid
            out["group_key"] = rg_name
        rollups.append(out)

    rollups.sort(key=lambda x: x["cost_1m"], reverse=True)
    return rollups


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_costs_by_resource(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """Cost per resource with 1m/3m/6m columns."""
    try:
        token = await extract_bearer_token_async(credential)
        cached_payload = _get_cached_cost_resource_payload(token)
        if cached_payload is not None:
            return {**cached_payload, "data_gaps": gaps.get_gaps()}

        sub_ids = await _get_subscription_ids(token)
        grouping = [
            {"type": "Dimension", "name": "ResourceId"},
            {"type": "Dimension", "name": "ResourceType"},
        ]

        fr1, to1 = _date_range(1)
        fr3, to3 = _date_range(3)
        fr6, to6 = _date_range(6)

        rows_1m = await _query_all_subs(token, fr1, to1, grouping, gaps, sub_ids=sub_ids)
        rows_3m = await _query_all_subs(token, fr3, to3, grouping, gaps, sub_ids=sub_ids)
        rows_6m = await _query_all_subs(token, fr6, to6, grouping, gaps, sub_ids=sub_ids)
        currency = _extract_currency_from_rows(rows_1m, rows_3m, rows_6m)

        # Index by (subscription_id, resource_id) to avoid cross-sub collisions.
        def _index(rows: list[dict]) -> tuple[dict[tuple[str, str], float], dict[tuple[str, str], dict[str, str]]]:
            out: dict[tuple[str, str], float] = {}
            meta: dict[tuple[str, str], dict[str, str]] = {}
            for r in rows:
                sid, rid, rg, rtype = _build_resource_identity(r)
                key = (sid, rid)
                out[key] = out.get(key, 0) + float(r.get("Cost", 0) or 0)

                slot = meta.setdefault(key, {"resource_group": "", "resource_type": ""})
                if rg and not slot["resource_group"]:
                    slot["resource_group"] = rg
                if rtype and not slot["resource_type"]:
                    slot["resource_type"] = rtype
            return out, meta

        m1, meta1 = _index(rows_1m)
        m3, meta3 = _index(rows_3m)
        m6, meta6 = _index(rows_6m)

        all_ids = set(m1) | set(m3) | set(m6)
        meta_all: dict[tuple[str, str], dict[str, str]] = {}
        for key, value in meta1.items():
            meta_all[key] = dict(value)
        for key, value in meta3.items():
            slot = meta_all.setdefault(key, {"resource_group": "", "resource_type": ""})
            if value.get("resource_group") and not slot["resource_group"]:
                slot["resource_group"] = value["resource_group"]
            if value.get("resource_type") and not slot["resource_type"]:
                slot["resource_type"] = value["resource_type"]
        for key, value in meta6.items():
            slot = meta_all.setdefault(key, {"resource_group": "", "resource_type": ""})
            if value.get("resource_group") and not slot["resource_group"]:
                slot["resource_group"] = value["resource_group"]
            if value.get("resource_type") and not slot["resource_type"]:
                slot["resource_type"] = value["resource_type"]

        costs = []
        for sid, rid in all_ids:
            c1 = m1.get((sid, rid), 0)
            c3 = m3.get((sid, rid), 0)
            c6 = m6.get((sid, rid), 0)
            parts = rid.rsplit("/", 1)
            name = parts[-1] if parts else rid

            metadata = meta_all.get((sid, rid), {})
            rg = metadata.get("resource_group") or _resource_group_from_resource_id(rid)
            if rg and rg.lower() in {"unknown", "n/a", "none", "null"}:
                rg = ""

            costs.append({
                "resource_id": rid,
                "resource_name": name,
                "resource_type": metadata.get("resource_type", ""),
                "resource_group": rg,
                "subscription_id": sid,
                "cost_1m": round(c1, 2),
                "cost_3m": round(c3, 2),
                "cost_6m": round(c6, 2),
                "currency": currency,
                "trend": _compute_trend(c1, c3 / 3 if c3 else 0),
                "monthly_avg_3m": round(c3 / 3, 2) if c3 else 0,
                "monthly_avg_6m": round(c6 / 6, 2) if c6 else 0,
            })

        costs.sort(key=lambda x: x["cost_1m"], reverse=True)

        total_1m = sum(c["cost_1m"] for c in costs)
        total_3m = sum(c["cost_3m"] for c in costs)
        total_6m = sum(c["cost_6m"] for c in costs)

        payload = {
            "costs": costs,
            "total_cost_1m": round(total_1m, 2),
            "total_cost_3m": round(total_3m, 2),
            "total_cost_6m": round(total_6m, 2),
            "currency": currency,
        }
        _set_cached_cost_resource_payload(token, payload)
        return {**payload, "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Cost by resource failed: %s", exc)
        gaps.add_gap(module="Costs", field="by_resource", reason=format_gap_reason(exc), severity="high",
                     remediation="Ensure Cost Management Reader role on subscriptions.")
        return {"costs": [], "total_cost_1m": 0, "total_cost_3m": 0, "total_cost_6m": 0, "currency": "UNKNOWN", "data_gaps": gaps.get_gaps()}


async def get_costs_by_group(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
    group_type: str = "resource_group",
) -> dict:
    """Cost rollup by resource_group / subscription / resource_type."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)

        dim_map = {
            "resource_group": "ResourceGroupName",
            "subscription": "SubscriptionId",
            "resource_type": "ResourceType",
        }
        dim_name = dim_map.get(group_type, "ResourceGroupName")
        grouping = [{"type": "Dimension", "name": dim_name}]

        fr1, to1 = _date_range(1)
        fr3, to3 = _date_range(3)
        fr6, to6 = _date_range(6)
        trend_from, trend_to = _trend_date_range(6)

        rows_1m = await _query_all_subs(token, fr1, to1, grouping, gaps, sub_ids=sub_ids)
        rows_3m = await _query_all_subs(token, fr3, to3, grouping, gaps, sub_ids=sub_ids)
        rows_6m = await _query_all_subs(token, fr6, to6, grouping, gaps, sub_ids=sub_ids)
        currency = _extract_currency_from_rows(rows_1m, rows_3m, rows_6m)

        def _index(rows: list[dict]) -> dict[tuple[str, str], float]:
            out: dict[tuple[str, str], float] = {}
            for row in rows:
                group_key = str(row.get(dim_name) or "").strip()
                subscription_id = str(row.get("subscription_id") or "").strip()
                if not group_key:
                    continue

                if group_type == "resource_group":
                    key = (subscription_id, group_key)
                elif group_type == "subscription":
                    key = (group_key, group_key)
                else:
                    key = ("", group_key)

                out[key] = out.get(key, 0) + float(row.get("Cost", 0) or 0)
            return out

        m1 = _index(rows_1m)
        m3 = _index(rows_3m)
        m6 = _index(rows_6m)
        all_keys = set(m1) | set(m3) | set(m6)

        rollups = []
        for subscription_id, group_key in all_keys:
            c1 = m1.get((subscription_id, group_key), 0)
            c3 = m3.get((subscription_id, group_key), 0)
            c6 = m6.get((subscription_id, group_key), 0)

            row: dict[str, Any] = {
                "group_key": group_key,
                "group_type": group_type,
                "cost_1m": round(c1, 2),
                "cost_3m": round(c3, 2),
                "cost_6m": round(c6, 2),
                "currency": currency,
                "trend": _compute_trend(c1, c3 / 3 if c3 else 0),
            }

            if group_type == "resource_group":
                row["subscription_id"] = subscription_id
            elif group_type == "subscription":
                row["subscription_id"] = group_key

            rollups.append(row)

        rollups.sort(key=lambda x: x["cost_1m"], reverse=True)
        return {"rollups": rollups, "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Cost by %s failed: %s", group_type, exc)
        gaps.add_gap(module="Costs", field=f"by_{group_type}", reason=format_gap_reason(exc), severity="high",
                     remediation="Ensure Cost Management Reader role.")
        return {"rollups": [], "data_gaps": gaps.get_gaps()}


async def get_cost_summary(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """Overall cost summary for Executive Summary."""
    try:
        import asyncio as _aio

        token = await extract_bearer_token_async(credential)
        fr1, to1 = _date_range(1)
        fr3, to3 = _date_range(3)
        fr6, to6 = _date_range(6)
        trend_from, trend_to = _trend_date_range(6)

        # Monthly granularity for trend over last 6 months
        sub_ids = await _get_subscription_ids(token)
        monthly_totals: dict[str, float] = {}

        monthly_semaphore = _aio.Semaphore(CONCURRENT_SUB_QUERIES)

        async def _monthly_for_sub(sub_id: str) -> None:
            """Fetch monthly cost data for a single subscription (30s cap)."""
            try:
                url = (
                    f"{MANAGEMENT_URL}/subscriptions/{sub_id}"
                    f"/providers/Microsoft.CostManagement/query?api-version={COST_API_VERSION}"
                )
                qbody = {
                    "type": "ActualCost",
                    "timeframe": "Custom",
                    "timePeriod": {"from": trend_from, "to": trend_to},
                    "dataset": {
                        "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
                        "granularity": "Monthly",
                    },
                }
                async with monthly_semaphore:
                    async with httpx.AsyncClient(timeout=HTTP_QUERY_TIMEOUT_SEC) as client:
                        data = await _request_json_with_retries(
                            client=client,
                            method="POST",
                            url=url,
                            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                            json_body=qbody,
                        )
                    if data.get("__status__") == 404:
                        return
                    props = data.get("properties", data)
                    columns = [c["name"] for c in props.get("columns", [])]
                    for row in props.get("rows", []):
                        rd = dict(zip(columns, row))
                        bm = str(rd.get("BillingMonth", rd.get("UsageDate", "")))[:7]
                        monthly_totals[bm] = monthly_totals.get(bm, 0) + (rd.get("Cost", 0) or 0)
            except Exception as sub_exc:
                logger.warning("Monthly cost query failed for %s: %s", sub_id, sub_exc)

        await _aio.gather(*[
            _aio.wait_for(_monthly_for_sub(sid), timeout=PER_SUB_QUERY_TIMEOUT_SEC)
            for sid in sub_ids
        ], return_exceptions=True)

        # Totals and type-level 1m drivers from the exact full-month windows.
        by_resource = await get_costs_by_resource(credential, gaps)
        cost_rows = by_resource.get("costs", []) if isinstance(by_resource, dict) else []
        total_1m = sum(float(r.get("cost_1m") or 0) for r in cost_rows)
        total_3m = sum(float(r.get("cost_3m") or 0) for r in cost_rows)
        total_6m = sum(float(r.get("cost_6m") or 0) for r in cost_rows)

        sorted_months = sorted(monthly_totals.keys())

        # Trend — compare last two COMPLETE months (skip current partial month)
        import datetime as _dt
        current_ym = _dt.date.today().strftime("%Y-%m")
        complete_months = [m for m in sorted_months if m != current_ym]
        if len(complete_months) >= 2:
            curr = monthly_totals.get(complete_months[-1], 0)
            prev = monthly_totals.get(complete_months[-2], 0)
            overall_trend = _compute_trend(curr, prev)
            trend_pct = round(((curr - prev) / abs(prev)) * 100, 1) if prev else 0
        else:
            overall_trend = "stable"
            trend_pct = 0

        # Top cost drivers from 1m data
        type_costs: dict[str, float] = {}
        for r in cost_rows:
            rt = str(r.get("resource_type") or "Unknown")
            type_costs[rt] = type_costs.get(rt, 0) + float(r.get("cost_1m") or 0)

        top_drivers = sorted(type_costs.items(), key=lambda x: x[1], reverse=True)[:5]
        by_month = [{"month": m, "amount": round(monthly_totals[m], 2)} for m in sorted_months]
        summary_currency = by_resource.get("currency", "UNKNOWN") if isinstance(by_resource, dict) else "UNKNOWN"
        return {
            "total_cost_1m": round(total_1m, 2),
            "total_cost_3m": round(total_3m, 2),
            "total_cost_6m": round(total_6m, 2),
            "currency": summary_currency,
            "overall_trend": overall_trend,
            "trend_percent": trend_pct,
            "top_cost_drivers": [
                {"resource_type": rt, "cost_1m": round(cost, 2), "trend": "stable"}
                for rt, cost in top_drivers
            ],
            "by_month": by_month,
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Cost summary failed: %s", exc)
        gaps.add_gap(module="Costs", field="summary", reason=format_gap_reason(exc), severity="high",
                     remediation="Ensure Cost Management Reader role.")
        return {
            "total_cost_1m": 0, "total_cost_3m": 0, "total_cost_6m": 0, "currency": "UNKNOWN",
            "overall_trend": "stable", "trend_percent": 0, "top_cost_drivers": [],
            "by_month": [], "data_gaps": gaps.get_gaps(),
        }
