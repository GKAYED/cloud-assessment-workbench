"""Inventory service — Azure Resource Graph queries for resource discovery.

Uses azure-mgmt-resourcegraph for cross-subscription queries and
azure-mgmt-resource for subscription listing.
"""

from __future__ import annotations

import asyncio
import math
import logging
from typing import Any

import httpx

from app.services.azure_auth import StaticTokenCredential, extract_bearer_token_async
from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

MANAGEMENT_URL = "https://management.azure.com"


def _to_float(value: Any) -> float | None:
    """Best-effort numeric conversion."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, str):
        text = value.strip().replace(",", "")
        if not text:
            return None
        try:
            number = float(text)
            return number if math.isfinite(number) else None
        except ValueError:
            return None
    return None


def _extract_current_size_gb(props: dict[str, Any]) -> float | None:
    """
    Try multiple provider-specific fields for current/allocated DB size.
    Returns GB when found.
    """
    if not props:
        return None

    # Direct GB fields used by some providers.
    direct_gb_keys = (
        "currentSizeGb",
        "currentSizeGB",
        "usedStorageGB",
        "storageSizeGB",
    )
    for key in direct_gb_keys:
        value = _to_float(props.get(key))
        if value and value > 0:
            return round(value, 1)

    # Nested GB fields.
    storage = props.get("storage") if isinstance(props.get("storage"), dict) else {}
    value = _to_float(storage.get("storageSizeGB"))
    if value and value > 0:
        return round(value, 1)

    # MB values that must be converted to GB.
    direct_mb_keys = ("currentSizeMB", "usedStorageMB", "storageMB")
    for key in direct_mb_keys:
        value = _to_float(props.get(key))
        if value and value > 0:
            return round(value / 1024, 1)

    storage_profile = props.get("storageProfile") if isinstance(props.get("storageProfile"), dict) else {}
    value = _to_float(storage_profile.get("storageMB"))
    if value and value > 0:
        return round(value / 1024, 1)

    # Byte values converted to GB.
    direct_byte_keys = ("currentSizeBytes", "databaseSizeBytes", "usedBytes")
    for key in direct_byte_keys:
        value = _to_float(props.get(key))
        if value and value > 0:
            return round(value / (1024 ** 3), 1)

    return None

# ---------------------------------------------------------------------------
# Portal-matching filter
# ---------------------------------------------------------------------------
# KQL fragment that excludes resource types and system databases the Azure
# Portal "All resources" blade hides. Kept here commented out so it can be
# restored later if portal-aligned counts are needed again.
#
# PORTAL_EXCLUDE_FILTER = """
# | where type !in~ (
#     'microsoft.cdn/profiles/afdendpoints',
#     'microsoft.compute/virtualmachines/extensions',
#     'microsoft.hybridcompute/machines/extensions',
#     'microsoft.network/privatednszones/virtualnetworklinks',
#     'microsoft.offazure/serversites',
#     'microsoft.offazure/vmwaresites',
#     'microsoft.web/certificates'
# )
# | where not(type =~ 'microsoft.sql/servers/databases' and name =~ 'master')
# """

PORTAL_EXCLUDE_FILTER = ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _arm_get(
    token: str,
    path: str,
    params: dict | None = None,
    api_version: str = "2022-09-01",
) -> dict:
    """Generic ARM REST GET call."""
    url = f"{MANAGEMENT_URL}{path}"
    if params is None:
        params = {}
    params["api-version"] = api_version
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"}, params=params)
        resp.raise_for_status()
        return resp.json()


async def _resource_graph_query(
    token: str,
    query: str,
    subscription_ids: list[str] | None = None,
) -> list[dict]:
    """Execute an Azure Resource Graph query, handling pagination."""
    url = f"{MANAGEMENT_URL}/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    body: dict[str, Any] = {"query": query, "options": {"$top": 1000, "resultFormat": "objectArray"}}
    if subscription_ids:
        body["subscriptions"] = subscription_ids

    all_rows: list[dict] = []
    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            all_rows.extend(data.get("data", []))
            skip_token = data.get("$skipToken")
            if not skip_token:
                break
            body["options"]["$skipToken"] = skip_token

    return all_rows


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_subscriptions(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """List all subscriptions the token has access to."""
    try:
        token = await extract_bearer_token_async(credential)
        data = await _arm_get(token, "/subscriptions")
        subs = [
            {
                "subscription_id": s["subscriptionId"],
                "display_name": s.get("displayName", ""),
                "state": s.get("state", "Unknown"),
                "tenant_id": s.get("tenantId", ""),
            }
            for s in data.get("value", [])
        ]
        return {"subscriptions": subs, "total_count": len(subs)}
    except Exception as exc:
        logger.warning("Failed to list subscriptions: %s", exc)
        gaps.add_gap(
            module="Inventory",
            field="subscriptions",
            reason=format_gap_reason(exc),
            severity="critical",
            remediation="Ensure the token has Reader role on at least one subscription.",
        )
        return {"subscriptions": [], "total_count": 0, "data_gaps": gaps.get_gaps()}


async def _get_subscription_ids(token: str) -> list[str]:
    """Retrieve subscription IDs for Resource Graph queries."""
    data = await _arm_get(token, "/subscriptions")
    return [s["subscriptionId"] for s in data.get("value", []) if s.get("state") == "Enabled"]


async def get_resources(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """Get all resources via Resource Graph."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)
        if not sub_ids:
            return {"resources": [], "total_count": 0, "data_gaps": []}

        query = f"""
        resources
        {PORTAL_EXCLUDE_FILTER}
        | project id, name, type, location, resourceGroup, subscriptionId, tags
        | extend is_tagged = isnotnull(tags) and tags != '{{}}'
        """
        rows = await _resource_graph_query(token, query, sub_ids)

        resources = [
            {
                "id": r.get("id", ""),
                "name": r.get("name", ""),
                "type": r.get("type", ""),
                "location": r.get("location", ""),
                "resource_group": r.get("resourceGroup", ""),
                "subscription_id": r.get("subscriptionId", ""),
                "tags": r.get("tags") or {},
                "is_tagged": bool(r.get("is_tagged", False)),
            }
            for r in rows
        ]
        return {"resources": resources, "total_count": len(resources), "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Failed to query resources: %s", exc)
        gaps.add_gap(
            module="Inventory",
            field="resources",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure the token has Reader role and Resource Graph access.",
        )
        return {"resources": [], "total_count": 0, "data_gaps": gaps.get_gaps()}


async def get_resource_groups(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """Get all resource groups via Resource Graph."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)
        if not sub_ids:
            return {"resource_groups": [], "total_count": 0}

        query = """
        resourcecontainers
        | where type == 'microsoft.resources/subscriptions/resourcegroups'
        | project name, location, subscriptionId, tags, provisioningState=properties.provisioningState
        """
        rg_rows = await _resource_graph_query(token, query, sub_ids)

        # Count resources per RG
        count_query = f"""
        resources
        {PORTAL_EXCLUDE_FILTER}
        | summarize resource_count = count() by resourceGroup, subscriptionId
        """
        count_rows = await _resource_graph_query(token, count_query, sub_ids)
        count_map = {
            (r["resourceGroup"].lower(), r["subscriptionId"]): r["resource_count"]
            for r in count_rows
        }

        rgs = [
            {
                "name": rg.get("name", ""),
                "location": rg.get("location", ""),
                "subscription_id": rg.get("subscriptionId", ""),
                "tags": rg.get("tags") or {},
                "provisioning_state": rg.get("provisioningState", ""),
                "resource_count": count_map.get(
                    (rg.get("name", "").lower(), rg.get("subscriptionId", "")), 0
                ),
            }
            for rg in rg_rows
        ]
        return {"resource_groups": rgs, "total_count": len(rgs)}
    except Exception as exc:
        logger.warning("Failed to list resource groups: %s", exc)
        gaps.add_gap(
            module="Inventory", field="resource_groups", reason=format_gap_reason(exc), severity="high",
            remediation="Ensure Reader role on subscriptions.",
        )
        return {"resource_groups": [], "total_count": 0, "data_gaps": gaps.get_gaps()}


async def get_inventory_summary(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """Aggregate inventory statistics."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)
        if not sub_ids:
            return {
                "total_subscriptions": 0, "total_resource_groups": 0, "total_resources": 0,
                "resources_by_type": {}, "resources_by_location": {},
                "untagged_count": 0, "untagged_percentage": 0,
            }

        by_type_q = f"resources {PORTAL_EXCLUDE_FILTER} | summarize count() by type"
        by_loc_q = f"resources {PORTAL_EXCLUDE_FILTER} | summarize count() by location"
        rg_count_q = (
            "resourcecontainers | where type == 'microsoft.resources/subscriptions/resourcegroups' "
            "| summarize count()"
        )
        untagged_q = (
            f"resources {PORTAL_EXCLUDE_FILTER} | where isnull(tags) or tags == '{{}}' | summarize count()"
        )
        total_q = f"resources {PORTAL_EXCLUDE_FILTER} | summarize count()"
        rg_count_q2 = f"resources {PORTAL_EXCLUDE_FILTER} | summarize count() by resourceGroup"

        type_rows, loc_rows, rg_rows, untag_rows, total_rows, rg_group_rows = await asyncio.gather(
            _resource_graph_query(token, by_type_q, sub_ids),
            _resource_graph_query(token, by_loc_q, sub_ids),
            _resource_graph_query(token, rg_count_q, sub_ids),
            _resource_graph_query(token, untagged_q, sub_ids),
            _resource_graph_query(token, total_q, sub_ids),
            _resource_graph_query(token, rg_count_q2, sub_ids),
        )

        total_resources = total_rows[0].get("count_", 0) if total_rows else 0
        untagged = untag_rows[0].get("count_", 0) if untag_rows else 0

        return {
            "total_subscriptions": len(sub_ids),
            "total_resource_groups": rg_rows[0].get("count_", 0) if rg_rows else 0,
            "total_resources": total_resources,
            "resources_by_type": {r["type"]: r["count_"] for r in type_rows},
            "resources_by_location": {r["location"]: r["count_"] for r in loc_rows},
            "resources_by_resource_group": {r["resourceGroup"]: r["count_"] for r in rg_group_rows},
            "untagged_count": untagged,
            "untagged_percentage": round((untagged / total_resources) * 100, 2) if total_resources else 0,
        }
    except Exception as exc:
        logger.warning("Failed to build inventory summary: %s", exc)
        gaps.add_gap(
            module="Inventory", field="summary", reason=format_gap_reason(exc), severity="high",
            remediation="Ensure Reader role and Resource Graph access.",
        )
        return {
            "total_subscriptions": 0, "total_resource_groups": 0, "total_resources": 0,
            "resources_by_type": {}, "resources_by_location": {},
            "untagged_count": 0, "untagged_percentage": 0, "data_gaps": gaps.get_gaps(),
        }


async def get_tree(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """Build hierarchical subscription → RG → resource tree."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)
        if not sub_ids:
            return {"tree": []}

        # Get subscription display names
        subs_data = await _arm_get(token, "/subscriptions")
        sub_names = {s["subscriptionId"]: s.get("displayName", s["subscriptionId"]) for s in subs_data.get("value", [])}

        query = f"""
        resources
        {PORTAL_EXCLUDE_FILTER}
        | project id, name, type, location, resourceGroup, subscriptionId, tags
        | extend is_tagged = isnotnull(tags) and tags != '{{}}'
        """
        rows = await _resource_graph_query(token, query, sub_ids)

        # Build tree
        tree: dict[str, dict] = {}
        for r in rows:
            sub_id = r.get("subscriptionId", "")
            rg = r.get("resourceGroup", "")

            if sub_id not in tree:
                tree[sub_id] = {
                    "id": sub_id,
                    "name": sub_names.get(sub_id, sub_id),
                    "type": "subscription",
                    "children": {},
                }

            sub_node = tree[sub_id]
            rg_key = rg.lower()
            if rg_key not in sub_node["children"]:
                sub_node["children"][rg_key] = {
                    "id": rg,
                    "name": rg,
                    "type": "resource_group",
                    "location": r.get("location", ""),
                    "children": [],
                }

            sub_node["children"][rg_key]["children"].append({
                "id": r.get("id", ""),
                "name": r.get("name", ""),
                "type": "resource",
                "resource_type": r.get("type", ""),
                "location": r.get("location", ""),
                "tags": r.get("tags") or {},
                "is_tagged": bool(r.get("is_tagged", False)),
            })

        # Convert dicts to lists
        result = []
        for sub_node in tree.values():
            sub_node["children"] = list(sub_node["children"].values())
            result.append(sub_node)

        return {"tree": result}
    except Exception as exc:
        logger.warning("Failed to build tree: %s", exc)
        gaps.add_gap(module="Inventory", field="tree", reason=format_gap_reason(exc), severity="high",
                     remediation="Ensure Reader role and Resource Graph access.")
        return {"tree": [], "data_gaps": gaps.get_gaps()}


async def get_databases(credential: StaticTokenCredential, gaps: DataGapCollector) -> dict:
    """Get all database/data-warehouse resources with SKU details."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)
        if not sub_ids:
            return {"databases": [], "total_count": 0, "by_type": {}, "data_gaps": []}

        query = """
        resources
        | where type in (
            'microsoft.sql/servers/databases',
            'microsoft.sql/managedinstances',
            'microsoft.synapse/workspaces/sqlpools',
            'microsoft.documentdb/databaseaccounts',
            'microsoft.dbformysql/flexibleservers',
            'microsoft.dbforpostgresql/flexibleservers'
        )
        | where not(type =~ 'microsoft.sql/servers/databases' and name =~ 'master')
        | project id, name, type, location, resourceGroup, subscriptionId,
            sku, properties
        """
        rows = await _resource_graph_query(token, query, sub_ids)

        TYPE_MAP = {
            "microsoft.sql/servers/databases": "SQL Database",
            "microsoft.sql/managedinstances": "SQL Managed Instance",
            "microsoft.synapse/workspaces/sqlpools": "Synapse SQL Pool",
            "microsoft.documentdb/databaseaccounts": "Cosmos DB",
            "microsoft.dbformysql/flexibleservers": "MySQL Flexible",
            "microsoft.dbforpostgresql/flexibleservers": "PostgreSQL Flexible",
        }

        databases = []
        by_type: dict[str, int] = {}
        for r in rows:
            db_type = TYPE_MAP.get(r.get("type", ""), r.get("type", ""))
            sku = r.get("sku") or {}
            props = r.get("properties") or {}

            max_bytes = props.get("maxSizeBytes")
            max_gb = round(max_bytes / (1024 ** 3), 1) if max_bytes else None
            current_gb = _extract_current_size_gb(props)
            size_source = "current" if current_gb is not None else "unknown"

            databases.append({
                "resource_id": r.get("id", ""),
                "resource_name": r.get("name", ""),
                "database_type": db_type,
                "sku_tier": sku.get("tier", ""),
                "sku_name": sku.get("name", ""),
                "max_size_gb": max_gb,
                "current_size_gb": current_gb,
                "size_source": size_source,
                "dtu_capacity": sku.get("capacity") if sku.get("family") is None else None,
                "vcore_count": sku.get("capacity") if sku.get("family") else None,
                "status": props.get("status", props.get("state", "Unknown")),
                "subscription_id": r.get("subscriptionId", ""),
                "resource_group": r.get("resourceGroup", ""),
            })
            by_type[db_type] = by_type.get(db_type, 0) + 1

        return {
            "databases": databases,
            "total_count": len(databases),
            "by_type": by_type,
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Failed to query databases: %s", exc)
        gaps.add_gap(module="Inventory", field="databases", reason=format_gap_reason(exc), severity="medium",
                     remediation="Ensure Reader role and Resource Graph access.")
        return {"databases": [], "total_count": 0, "by_type": {}, "data_gaps": gaps.get_gaps()}
