"""Governance service — Azure Policy, RBAC, and orphaned resource discovery.

Uses the Azure ARM REST API to retrieve:
  - Policy compliance state (Microsoft.PolicyInsights)
  - Role assignments (Microsoft.Authorization)
  - Orphaned resources via Resource Graph (unattached disks, unused NICs, etc.)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.services.azure_auth import StaticTokenCredential, extract_bearer_token_async
from app.services.data_gap_collector import DataGapCollector, format_gap_reason

logger = logging.getLogger(__name__)

MANAGEMENT_URL = "https://management.azure.com"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _arm_get(token: str, path: str, api_version: str, params: dict | None = None) -> dict:
    """Generic ARM REST GET."""
    url = f"{MANAGEMENT_URL}{path}"
    p = {"api-version": api_version}
    if params:
        p.update(params)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"}, params=p)
        resp.raise_for_status()
        return resp.json()


async def _arm_post(token: str, url: str, body: dict | None = None) -> dict:
    """Generic ARM REST POST (full URL)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body or {},
        )
        resp.raise_for_status()
        return resp.json()


async def _get_subscription_ids(token: str) -> list[str]:
    data = await _arm_get(token, "/subscriptions", "2022-09-01")
    return [s["subscriptionId"] for s in data.get("value", []) if s.get("state") == "Enabled"]


async def _get_subscriptions(token: str) -> dict[str, str]:
    """Return map of subscriptionId -> displayName.

    The Azure REST API provides ``displayName`` for each subscription, which
    is what we surface as ``subscription_name`` in the frontend.  Some
    environments unfortunately have meaningless names (GUIDs) so we also
    support an optional manual override via ``AZAUDIT_SUBSCRIPTION_NAME_MAP``
    (see :pyclass:`app.config.Settings`).  The override string is a comma-
    separated list of ``id=name`` pairs and takes precedence over Azure data.
    """
    data = await _arm_get(token, "/subscriptions", "2022-09-01")
    # store keys in lowercase to avoid mismatches due to casing elsewhere
    sub_map: dict[str, str] = {
        (s.get("subscriptionId") or "").lower():
            s.get("displayName", s.get("subscriptionId", ""))
        for s in data.get("value", [])
        if s.get("state") == "Enabled"
    }
    # apply manual overrides if configured (keys should also be lowercased)
    try:
        from app.config import settings
        if settings.subscription_name_map:
            for pair in settings.subscription_name_map.split(","):
                if "=" in pair:
                    sid, name = pair.split("=", 1)
                    sid = sid.strip().lower()
                    name = name.strip()
                    if sid:
                        sub_map[sid] = name
    except ImportError:
        # configuration unavailable in some test contexts
        pass

    return sub_map


async def _resource_graph_query(token: str, query: str, sub_ids: list[str]) -> list[dict]:
    """Run a Resource Graph query with pagination."""
    url = f"{MANAGEMENT_URL}/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01"
    body: dict[str, Any] = {
        "query": query,
        "subscriptions": sub_ids,
        "options": {"resultFormat": "objectArray", "$top": 1000},
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    all_rows: list[dict] = []
    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            resp = await client.post(url, headers=headers, json=body)
            if not resp.is_success:
                detail = ""
                try:
                    payload = resp.json()
                    detail = str(payload.get("error") or payload)
                except Exception:
                    detail = resp.text[:500]
                raise httpx.HTTPStatusError(
                    f"Resource Graph query failed ({resp.status_code}): {detail}",
                    request=resp.request,
                    response=resp,
                )
            data = resp.json()
            all_rows.extend(data.get("data", []))
            skip_token = data.get("$skipToken")
            if not skip_token:
                break
            body["options"]["$skipToken"] = skip_token
    return all_rows


# ---------------------------------------------------------------------------
# 1. Policy Compliance
# ---------------------------------------------------------------------------


async def get_policy_compliance(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Retrieve Azure Policy compliance summary across subscriptions.

    Uses ``/providers/Microsoft.PolicyInsights/policyStates/latest/summarize``
    at subscription scope and aggregates results.
    """
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)

        all_policy_states: list[dict] = []

        async def _compliance_for_sub(sub_id: str) -> dict | None:
            try:
                url = (
                    f"{MANAGEMENT_URL}/subscriptions/{sub_id}"
                    f"/providers/Microsoft.PolicyInsights/policyStates/latest/summarize"
                    f"?api-version=2019-10-01"
                )
                data = await _arm_post(token, url)
                summaries = data.get("value", [])
                if not summaries:
                    return None
                summary = summaries[0]
                results = summary.get("results", {})
                resource_details = results.get("resourceDetails") or []

                compliant_count = 0
                evaluated_resources = 0
                for entry in resource_details:
                    if not isinstance(entry, dict):
                        continue
                    try:
                        count = int(entry.get("count", 0) or 0)
                    except Exception:
                        count = 0
                    state = str(entry.get("complianceState", "")).lower()
                    evaluated_resources += count
                    if state == "compliant":
                        compliant_count += count

                # Policy Insights payloads can vary by API/version. Guard against
                # under-counted totals so non-compliance rates remain meaningful.
                non_compliant_resources = int(results.get("nonCompliantResources", 0) or 0)
                if evaluated_resources <= 0:
                    evaluated_resources = int(results.get("totalResourcesCount", 0) or 0)
                if evaluated_resources < (compliant_count + non_compliant_resources):
                    evaluated_resources = compliant_count + non_compliant_resources
                if evaluated_resources < non_compliant_resources:
                    evaluated_resources = non_compliant_resources

                compliance_rate = (
                    round((compliant_count / evaluated_resources) * 100, 1)
                    if evaluated_resources > 0
                    else 0.0
                )
                non_compliance_rate = (
                    round((non_compliant_resources / evaluated_resources) * 100, 1)
                    if evaluated_resources > 0
                    else 0.0
                )

                top_non_compliant = [
                    {
                        "policy_assignment_id": pa.get("policyAssignmentId", ""),
                        "policy_name": (pa.get("policySetDefinition") or {}).get("name", "")
                            or pa.get("policyAssignmentId", "").rsplit("/", 1)[-1],
                        "non_compliant_resources": pa.get("results", {}).get("nonCompliantResources", 0),
                        "non_compliant_policies": pa.get("results", {}).get("nonCompliantPolicies", 0),
                    }
                    for pa in (summary.get("policyAssignments") or [])
                    if pa.get("results", {}).get("nonCompliantResources", 0) > 0
                ]
                top_non_compliant.sort(
                    key=lambda item: int(item.get("non_compliant_resources", 0) or 0),
                    reverse=True,
                )

                return {
                    "subscription_id": sub_id,
                    "total_resources": evaluated_resources,
                    "compliant": compliant_count,
                    "non_compliant_resources": non_compliant_resources,
                    "non_compliant_policies": results.get("nonCompliantPolicies", 0),
                    "compliance_rate": compliance_rate,
                    "non_compliance_rate": non_compliance_rate,
                    "policy_assignments": len(summary.get("policyAssignments", [])),
                    "top_non_compliant": top_non_compliant[:10],
                }
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (404, 403):
                    gaps.add_gap(
                        module="Governance",
                        field=f"policy_{sub_id}",
                        reason=format_gap_reason(exc, "Policy Insights not available. May need Policy Reader role"),
                        severity="medium",
                        remediation="Grant Policy Reader role or enable Azure Policy on this subscription.",
                    )
                    return None
                raise

        results = await asyncio.gather(
            *[asyncio.wait_for(_compliance_for_sub(sid), timeout=30) for sid in sub_ids],
            return_exceptions=True,
        )

        for r in results:
            if isinstance(r, dict):
                all_policy_states.append(r)
            elif isinstance(r, Exception):
                logger.warning("Policy compliance sub-query failed: %s", r)

        # map subscription names
        sub_map = await _get_subscriptions(token)
        for s in all_policy_states:
            sid = (s.get("subscription_id", "") or "").lower()
            s["subscription_name"] = sub_map.get(sid, s.get("subscription_id", ""))

        # Aggregate
        total_non_compliant_resources = sum(s["non_compliant_resources"] for s in all_policy_states)
        total_non_compliant_policies = sum(s["non_compliant_policies"] for s in all_policy_states)
        total_assignments = sum(s["policy_assignments"] for s in all_policy_states)

        return {
            "by_subscription": all_policy_states,
            "total_non_compliant_resources": total_non_compliant_resources,
            "total_non_compliant_policies": total_non_compliant_policies,
            "total_policy_assignments": total_assignments,
            "subscription_count": len(all_policy_states),
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Policy compliance failed: %s", exc)
        gaps.add_gap(
            module="Governance",
            field="policy_compliance",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Reader or Policy Reader role on subscriptions.",
        )
        return {
            "by_subscription": [],
            "total_non_compliant_resources": 0,
            "total_non_compliant_policies": 0,
            "total_policy_assignments": 0,
            "subscription_count": 0,
            "data_gaps": gaps.get_gaps(),
        }


# ---------------------------------------------------------------------------
# 2. RBAC Role Assignments
# ---------------------------------------------------------------------------

# Well-known built-in role IDs → friendly names
BUILTIN_ROLES: dict[str, str] = {
    "acdd72a7-3385-48ef-bd42-f606fba81ae7": "Reader",
    "b24988ac-6180-42a0-ab88-20f7382dd24c": "Contributor",
    "8e3af657-a8ff-443c-a75c-2fe8c4bcb635": "Owner",
    "18d7d88d-d35e-4fb5-a5c3-7773c20a72d9": "User Access Administrator",
    "f58310d9-a9f6-439a-9e8d-f62e7b41a168": "Role Based Access Control Administrator",
    "9980e02c-c2be-4d73-94e8-173b1dc7cf3c": "Virtual Machine Contributor",
    "de139f84-1756-47ae-9be6-808fbbe84772": "Website Contributor",
    "4d97b98b-1d4f-4787-a291-c67834d212e7": "Network Contributor",
    "ba92f5b4-2d11-453d-a403-e96b0029c9fe": "Storage Blob Data Contributor",
    "17d1049b-9a84-46fb-8f53-869881c3d3ab": "Storage Account Contributor",
    "fb1c8493-542b-48eb-b624-b4c8fea62acd": "Security Admin",
    "39bc4728-0917-49c7-9d2c-d95423bc2eb4": "Security Reader",
}


async def get_role_assignments(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Retrieve RBAC role assignments across subscriptions.

    Uses ``/subscriptions/{id}/providers/Microsoft.Authorization/roleAssignments``
    and resolves role definition names.
    """
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)
        all_assignments: list[dict] = []

        # Cache for role definition lookups
        role_name_cache: dict[str, str] = dict(BUILTIN_ROLES)

        async def _resolve_role_name(role_def_id: str) -> str:
            """Extract built-in role name or fetch custom role name."""
            # Role definition ID format: /subscriptions/{sub}/providers/Microsoft.Authorization/roleDefinitions/{guid}
            role_guid = role_def_id.rsplit("/", 1)[-1] if role_def_id else ""
            if role_guid in role_name_cache:
                return role_name_cache[role_guid]
            try:
                data = await _arm_get(token, role_def_id, "2022-04-01")
                name = data.get("properties", {}).get("roleName", role_guid)
                role_name_cache[role_guid] = name
                return name
            except Exception:
                return role_guid

        async def _assignments_for_sub(sub_id: str) -> list[dict]:
            try:
                data = await _arm_get(
                    token,
                    f"/subscriptions/{sub_id}/providers/Microsoft.Authorization/roleAssignments",
                    "2022-04-01",
                )
                assignments = []
                for ra in data.get("value", []):
                    props = ra.get("properties", {})
                    role_def_id = props.get("roleDefinitionId", "")
                    role_name = await _resolve_role_name(role_def_id)
                    principal_type = props.get("principalType", "Unknown")
                    assignments.append({
                        "id": ra.get("id", ""),
                        "subscription_id": sub_id,
                        "principal_id": props.get("principalId", ""),
                        "principal_type": principal_type,
                        "role_name": role_name,
                        "role_definition_id": role_def_id,
                        "scope": props.get("scope", ""),
                        "created_on": props.get("createdOn", ""),
                    })
                return assignments
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (403, 404):
                    gaps.add_gap(
                        module="Governance",
                        field=f"rbac_{sub_id}",
                        reason=format_gap_reason(exc, "RBAC query failed"),
                        severity="medium",
                        remediation="Grant Reader role to list role assignments.",
                    )
                    return []
                raise

        results = await asyncio.gather(
            *[asyncio.wait_for(_assignments_for_sub(sid), timeout=30) for sid in sub_ids],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, list):
                all_assignments.extend(r)
            elif isinstance(r, Exception):
                logger.warning("RBAC sub-query failed: %s", r)

        # add subscription names
        sub_map = await _get_subscriptions(token)
        for a in all_assignments:
            sid = (a.get("subscription_id", "") or "").lower()
            a["subscription_name"] = sub_map.get(sid, a.get("subscription_id", ""))

        # Compute summary
        by_role: dict[str, int] = {}
        by_principal_type: dict[str, int] = {}
        owner_count = 0
        contributor_count = 0

        for a in all_assignments:
            rn = a["role_name"]
            pt = a["principal_type"]
            by_role[rn] = by_role.get(rn, 0) + 1
            by_principal_type[pt] = by_principal_type.get(pt, 0) + 1
            if rn == "Owner":
                owner_count += 1
            elif rn == "Contributor":
                contributor_count += 1

        return {
            "assignments": all_assignments,
            "total_count": len(all_assignments),
            "by_role": dict(sorted(by_role.items(), key=lambda x: x[1], reverse=True)),
            "by_principal_type": by_principal_type,
            "owner_count": owner_count,
            "contributor_count": contributor_count,
            "subscription_count": len(sub_ids),
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("RBAC role assignments failed: %s", exc)
        gaps.add_gap(
            module="Governance",
            field="role_assignments",
            reason=format_gap_reason(exc),
            severity="high",
            remediation="Ensure Reader role on subscriptions.",
        )
        return {
            "assignments": [],
            "total_count": 0,
            "by_role": {},
            "by_principal_type": {},
            "owner_count": 0,
            "contributor_count": 0,
            "subscription_count": 0,
            "data_gaps": gaps.get_gaps(),
        }


# ---------------------------------------------------------------------------
# 3. Orphaned Resources
# ---------------------------------------------------------------------------

ORPHAN_QUERIES: dict[str, str] = {
    "unattached_disks": """
        resources
        | where type == 'microsoft.compute/disks'
        | where properties.diskState == 'Unattached'
        | project id, name, type, location, resourceGroup, subscriptionId,
            sku_name = sku.name, size_gb = properties.diskSizeGB
    """,
    "unused_nics": """
        resources
        | where type == 'microsoft.network/networkinterfaces'
        | where isnull(properties.virtualMachine)
        | project id, name, type, location, resourceGroup, subscriptionId
    """,
    "unused_nsgs": """
        resources
        | where type == 'microsoft.network/networksecuritygroups'
        | where isnull(properties.networkInterfaces) or array_length(properties.networkInterfaces) == 0
        | where isnull(properties.subnets) or array_length(properties.subnets) == 0
        | project id, name, type, location, resourceGroup, subscriptionId
    """,
    "unused_public_ips": """
        resources
        | where type == 'microsoft.network/publicipaddresses'
        | where isnull(properties.ipConfiguration)
        | project id, name, type, location, resourceGroup, subscriptionId,
            sku_name = sku.name, ip = properties.ipAddress
    """,
    "empty_resource_groups": """
        resourcecontainers
        | where type == 'microsoft.resources/subscriptions/resourcegroups'
        | project rg_name = tolower(name), original_name = name, location, subscriptionId
        | join kind=leftouter (
            resources
            | summarize resource_count = count() by resourceGroup = tolower(resourceGroup), subscriptionId
        ) on subscriptionId, $left.rg_name == $right.resourceGroup
        | where isnull(resource_count) or resource_count == 0
        | project id = strcat('/subscriptions/', subscriptionId, '/resourceGroups/', original_name),
            name = original_name, type = 'Empty Resource Group', location, resourceGroup = original_name, subscriptionId
    """,
}


async def get_orphaned_resources(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Discover orphaned / unused resources that may be wasting cost.

    Uses Azure Resource Graph to find:
      - Unattached managed disks
      - NICs not attached to a VM
      - NSGs not attached to a NIC or subnet
      - Public IPs not associated with a resource
      - Empty resource groups
    """
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)
        if not sub_ids:
            return {"orphans": [], "by_type": {}, "total_count": 0, "data_gaps": gaps.get_gaps()}

        all_orphans: list[dict] = []
        by_type: dict[str, int] = {}

        async def _run_query(category: str, query: str) -> list[dict]:
            rows = await _resource_graph_query(token, query, sub_ids)
            results = []
            for r in rows:
                results.append({
                    "category": category,
                    "resource_id": r.get("id", ""),
                    "resource_name": r.get("name", ""),
                    "resource_type": r.get("type", ""),
                    "location": r.get("location", ""),
                    "resource_group": r.get("resourceGroup", ""),
                    "subscription_id": r.get("subscriptionId", ""),
                    "sku_name": r.get("sku_name", ""),
                    "size_gb": r.get("size_gb"),
                    "ip": r.get("ip", ""),
                })
            return results

        results = await asyncio.gather(
            *[
                asyncio.wait_for(_run_query(cat, q), timeout=30)
                for cat, q in ORPHAN_QUERIES.items()
            ],
            return_exceptions=True,
        )

        for i, (cat, _) in enumerate(ORPHAN_QUERIES.items()):
            r = results[i]
            if isinstance(r, list):
                all_orphans.extend(r)
                by_type[cat] = len(r)
            elif isinstance(r, Exception):
                logger.warning("Orphan query %s failed: %s", cat, r)
                gaps.add_gap(
                    module="Governance",
                    field=f"orphan_{cat}",
                    reason=format_gap_reason(r),
                    severity="low",
                    remediation="Ensure Reader and Resource Graph access.",
                )
                by_type[cat] = 0

        # map subscription names
        sub_map = await _get_subscriptions(token)
        for o in all_orphans:
            sid = (o.get("subscription_id", "") or "").lower()
            o["subscription_name"] = sub_map.get(sid, o.get("subscription_id", ""))

        return {
            "orphans": all_orphans,
            "by_type": by_type,
            "total_count": len(all_orphans),
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Orphaned resource discovery failed: %s", exc)
        gaps.add_gap(
            module="Governance",
            field="orphaned_resources",
            reason=format_gap_reason(exc),
            severity="medium",
            remediation="Ensure Reader role and Resource Graph access.",
        )
        return {"orphans": [], "by_type": {}, "total_count": 0, "data_gaps": gaps.get_gaps()}
