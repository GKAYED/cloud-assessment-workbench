"""Dynamics 365 service — Power Platform, Dataverse, Business Central.

API endpoints used:
  - Global Discovery:     https://globaldisco.crm.dynamics.com/api/discovery/v2.0
  - Power Platform Admin: https://api.bap.microsoft.com (fallback)
  - Dataverse Web API:    https://{org}.crm.dynamics.com/api/data/v9.2
  - BC API:               https://{env}.api.bc.dynamics.com/v2.0

Environment discovery uses Global Discovery (no admin required) with
fallback to the BAP Admin API when a BAP-scoped token is available.

Tokens come from the frontend; each API scope requires its own token.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

import httpx

from app.services.data_gap_collector import DataGapCollector

logger = logging.getLogger(__name__)

BAP_URL = "https://api.bap.microsoft.com"
GLOBAL_DISCO_URL = "https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances"
DataverseTokenResolver = Callable[[str], Awaitable[str | None]]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _format_api_error(exc: Exception) -> str:
    """Return a concise but useful API error string for data-gap reporting."""
    response = getattr(exc, "response", None)
    if response is None:
        return str(exc)
    status_code = getattr(response, "status_code", None)
    detail = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            detail = str(payload.get("error") or payload.get("detail") or payload)
        else:
            detail = str(payload)
    except Exception:
        try:
            detail = response.text
        except Exception:
            detail = ""
    detail = " ".join(detail.split())
    if len(detail) > 240:
        detail = detail[:237] + "..."
    if status_code is not None and detail:
        return f"HTTP {status_code}: {detail}"
    if status_code is not None:
        return f"HTTP {status_code}"
    return str(exc)


async def _get(token: str, url: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


async def _get_pages(token: str, url: str) -> list[dict]:
    """Fetch all pages from a paged API."""
    all_items: list[dict] = []
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            all_items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
    return all_items


# ---------------------------------------------------------------------------
# Environment discovery — Global Discovery first, BAP Admin fallback
# ---------------------------------------------------------------------------


async def _discover_via_global_disco(token: str) -> list[dict]:
    """Discover Dataverse instances via the Global Discovery Service.

    This endpoint works with a regular Dataverse user token
    (``https://globaldisco.crm.dynamics.com/.default``) and does NOT
    require Power Platform Admin or Global Admin roles.

    Returns a list of dicts with normalised environment metadata.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            GLOBAL_DISCO_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    environments: list[dict] = []
    for inst in data.get("value", []):
        instance_url = (inst.get("Url") or inst.get("ApiUrl") or "").rstrip("/")
        environments.append({
            "id": inst.get("Id", ""),
            "name": inst.get("UniqueName", ""),
            "display_name": inst.get("FriendlyName", ""),
            "type": inst.get("Purpose", ""),
            "state": inst.get("State", ""),
            "region": inst.get("Region", ""),
            "created": "",
            "org_id": inst.get("UniqueName", ""),
            "instance_url": instance_url,
            "version": inst.get("Version", ""),
            "domain_name": inst.get("UrlName", ""),
        })
    return environments


async def _discover_via_bap_admin(token: str) -> list[dict]:
    """Discover environments via the BAP Admin API (requires admin role)."""
    data = await _get(
        token,
        f"{BAP_URL}/providers/Microsoft.BusinessAppsPlatform/scopes/admin/environments?api-version=2023-06-01",
    )
    environments: list[dict] = []
    for env in data.get("value", []):
        props = env.get("properties", {})
        linked = props.get("linkedEnvironmentMetadata", {})
        instance_url = (linked.get("instanceUrl") or "").rstrip("/")
        environments.append({
            "id": env.get("id", ""),
            "name": env.get("name", ""),
            "display_name": props.get("displayName", ""),
            "type": props.get("environmentSku", ""),
            "state": props.get("states", {}).get("runtime", {}).get("id", "Enabled"),
            "region": props.get("azureRegion", ""),
            "created": props.get("createdTime", ""),
            "org_id": linked.get("uniqueName", ""),
            "instance_url": instance_url,
            "version": linked.get("version", ""),
            "domain_name": linked.get("domainName", ""),
        })
    return environments


async def discover_environments(
    dataverse_token: str | None = None,
    bap_token: str | None = None,
) -> list[dict]:
    """Discover Dataverse/Power Platform environments.

    Strategy (no admin required):
      1. Try Global Discovery Service with Dataverse token (regular user).
      2. Fall back to BAP Admin API with BAP token (needs admin — optional).

    Returns a normalised list of environment dicts.
    """
    # 1. Global Discovery — works with any Dataverse user
    if dataverse_token:
        try:
            envs = await _discover_via_global_disco(dataverse_token)
            if envs:
                logger.info("Discovered %d environment(s) via Global Discovery", len(envs))
                return envs
        except Exception as exc:
            logger.debug("Global Discovery failed: %s", exc)

    # 2. BAP Admin fallback
    if bap_token:
        try:
            envs = await _discover_via_bap_admin(bap_token)
            if envs:
                logger.info("Discovered %d environment(s) via BAP Admin API", len(envs))
                return envs
        except Exception as exc:
            logger.debug("BAP Admin discovery failed: %s", exc)

    return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_environments(token: str, gaps: DataGapCollector, *, dataverse_token: str | None = None) -> dict:
    """List Power Platform / Dataverse environments.

    Uses Global Discovery (no admin needed) with BAP Admin fallback.
    Required scope: ``https://globaldisco.crm.dynamics.com/.default``
    """
    try:
        environments = await discover_environments(
            dataverse_token=dataverse_token or token,
            bap_token=token,
        )
        if not environments:
            gaps.add_gap(
                module="Dynamics365",
                field="environments",
                reason="No environments found via Global Discovery or BAP Admin.",
                severity="high",
                remediation="Ensure the identity has a Dataverse security role (e.g. Basic User) in at least one environment.",
            )
        return {"environments": environments, "total_count": len(environments), "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Power Platform environments failed: %s", exc)
        gaps.add_gap(
            module="Dynamics365",
            field="environments",
            reason=_format_api_error(exc),
            severity="high",
            remediation="Ensure the identity has a Dataverse security role (e.g. Basic User) in at least one environment.",
        )
        return {"environments": [], "total_count": 0, "data_gaps": gaps.get_gaps()}


async def get_users(
    token: str,
    gaps: DataGapCollector,
    *,
    dataverse_token: str | None = None,
    dataverse_token_resolver: DataverseTokenResolver | None = None,
) -> dict:
    """List D365 / Dataverse users.

    The token should be a Dataverse token scoped to
    ``https://{org}.crm.dynamics.com/.default``.
    The org URL is discovered via Global Discovery; if not available,
    the caller must supply a Dataverse-scoped token directly.
    """
    try:
        envs = await discover_environments(
            dataverse_token=dataverse_token or token,
            bap_token=token,
        )

        all_users: list[dict] = []
        processed_orgs: set[str] = set()

        for env in envs:
            instance_url = (env.get("instance_url") or "").rstrip("/")
            domain_name = env.get("domain_name", "")
            if not instance_url or instance_url in processed_orgs:
                continue
            processed_orgs.add(instance_url)

            try:
                # Dataverse org APIs require an org-scoped token:
                # https://{org}.crm.dynamics.com/.default
                org_token = token
                if dataverse_token_resolver and instance_url:
                    resolved = await dataverse_token_resolver(instance_url)
                    if resolved:
                        org_token = resolved

                users_url = (
                    f"{instance_url}/api/data/v9.2/systemusers"
                    "?$select=fullname,internalemailaddress,isdisabled,accessmode,azureactivedirectoryobjectid,businessunitid"
                    "&$filter=isdisabled eq false and accessmode ne 3"
                    "&$top=5000"
                )
                users = await _get_pages(org_token, users_url)

                # Fetch security role assignments for this environment
                role_map: dict[str, list[str]] = {}  # userid -> [role names]
                try:
                    roles_url = (
                        f"{instance_url}/api/data/v9.2/systemuserroles_association"
                        "?$select=systemuserid,roleid"
                        "&$top=5000"
                    )
                    role_assoc = await _get_pages(org_token, roles_url)
                    # Get role names
                    role_names: dict[str, str] = {}
                    try:
                        rn_url = (
                            f"{instance_url}/api/data/v9.2/roles"
                            "?$select=roleid,name"
                            "&$top=1000"
                        )
                        roles_raw = await _get_pages(org_token, rn_url)
                        for r in roles_raw:
                            role_names[r.get("roleid", "")] = r.get("name", "")
                    except Exception:
                        pass
                    for ra in role_assoc:
                        uid = ra.get("systemuserid", "")
                        rid = ra.get("roleid", "")
                        rname = role_names.get(rid, rid)
                        role_map.setdefault(uid, []).append(rname)
                except Exception:
                    gaps.add_gap(
                        module="Dynamics365",
                        field=f"security_roles_{domain_name}",
                        reason="Could not retrieve role assignments; requires systemuserroles_association read access.",
                        severity="low",
                        remediation="Grant read access to security role assignment entities.",
                    )

                for u in users:
                    uid = u.get("systemuserid", "")
                    roles = role_map.get(uid, [])
                    bu_ref = u.get("_businessunitid_value", "") or u.get("businessunitid", "")
                    all_users.append({
                        "user_id": uid,
                        "full_name": u.get("fullname", ""),
                        "email": u.get("internalemailaddress", ""),
                        "is_disabled": u.get("isdisabled", False),
                        "access_mode": u.get("accessmode", 0),
                        "environment": domain_name,
                        "aad_object_id": u.get("azureactivedirectoryobjectid", ""),
                        "roles": roles,
                        "security_roles": roles,
                        "business_unit": bu_ref,
                    })
            except Exception as sub_exc:
                logger.warning("Dataverse users for %s: %s", instance_url, sub_exc)
                status_code = getattr(getattr(sub_exc, "response", None), "status_code", None)
                if status_code in (401, 403):
                    gaps.add_gap(
                        module="Dynamics365",
                        field="users_access",
                        reason="Dataverse access denied for one or more environments (401/403).",
                        severity="medium",
                        remediation="Grant Dataverse Basic User + read permissions to the signed-in identity in each target environment.",
                    )
                    continue
                gaps.add_gap(
                    module="Dynamics365",
                    field=f"users_{domain_name}",
                    reason=_format_api_error(sub_exc),
                    severity="medium",
                    remediation="Ensure the identity has Basic User role in this Dataverse environment.",
                )

        # Note: last login data requires audit log — add as gap
        if all_users:
            gaps.add_gap(
                module="Dynamics365",
                field="last_login",
                reason="Dataverse does not provide built-in last login date; audit logs required.",
                severity="low",
                remediation="Enable audit logging in Dataverse for sign-in tracking.",
            )

        return {"users": all_users, "total_count": len(all_users), "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Dataverse users failed: %s", exc)
        gaps.add_gap(module="Dynamics365", field="users", reason=_format_api_error(exc), severity="high",
                     remediation="Provide a Dataverse-scoped token.")
        return {"users": [], "total_count": 0, "data_gaps": gaps.get_gaps()}


async def get_module_stats(
    token: str,
    gaps: DataGapCollector,
    *,
    dataverse_token: str | None = None,
    dataverse_token_resolver: DataverseTokenResolver | None = None,
) -> dict:
    """D365 module usage statistics from Dataverse solution entities."""
    try:
        envs = await discover_environments(
            dataverse_token=dataverse_token or token,
            bap_token=token,
        )

        all_modules: list[dict] = []
        processed: set[str] = set()

        for env in envs:
            instance_url = (env.get("instance_url") or "").rstrip("/")
            domain_name = env.get("domain_name", "")
            if not instance_url or instance_url in processed:
                continue
            processed.add(instance_url)

            try:
                # Dataverse org APIs require an org-scoped token:
                # https://{org}.crm.dynamics.com/.default
                org_token = token
                if dataverse_token_resolver and instance_url:
                    resolved = await dataverse_token_resolver(instance_url)
                    if resolved:
                        org_token = resolved

                # Query solutions for installed D365 modules
                sol_url = (
                    f"{instance_url}/api/data/v9.2/solutions"
                    "?$select=friendlyname,uniquename,version,ismanaged,installedon"
                    "&$filter=isvisible eq true"
                    "&$orderby=friendlyname"
                )
                solutions = await _get_pages(org_token, sol_url)
                for sol in solutions:
                    all_modules.append({
                        "name": sol.get("friendlyname", ""),
                        "unique_name": sol.get("uniquename", ""),
                        "version": sol.get("version", ""),
                        "is_managed": sol.get("ismanaged", False),
                        "installed_on": sol.get("installedon", ""),
                        "environment": domain_name,
                    })
            except Exception as sub_exc:
                logger.warning("Module stats for %s: %s", instance_url, sub_exc)
                status_code = getattr(getattr(sub_exc, "response", None), "status_code", None)
                if status_code in (401, 403):
                    gaps.add_gap(
                        module="Dynamics365",
                        field="modules_access",
                        reason="Dataverse solution/module access denied for one or more environments (401/403).",
                        severity="medium",
                        remediation="Grant Dataverse read access to solution metadata in each target environment.",
                    )
                    continue
                gaps.add_gap(
                    module="Dynamics365",
                    field=f"modules_{domain_name}",
                    reason=_format_api_error(sub_exc),
                    severity="medium",
                    remediation="Ensure Dataverse token and read access to solutions.",
                )

        return {"modules": all_modules, "total_count": len(all_modules), "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Module stats failed: %s", exc)
        gaps.add_gap(module="Dynamics365", field="modules", reason=_format_api_error(exc), severity="high",
                     remediation="Provide a Dataverse-scoped token.")
        return {"modules": [], "total_count": 0, "data_gaps": gaps.get_gaps()}


async def get_workflow_health(
    token: str,
    gaps: DataGapCollector,
    *,
    dataverse_token: str | None = None,
    dataverse_token_resolver: DataverseTokenResolver | None = None,
) -> dict:
    """D365 workflow / Power Automate flow health from Dataverse."""
    try:
        envs = await discover_environments(
            dataverse_token=dataverse_token or token,
            bap_token=token,
        )

        all_flows: list[dict] = []
        processed: set[str] = set()

        for env in envs:
            instance_url = (env.get("instance_url") or "").rstrip("/")
            domain_name = env.get("domain_name", "")
            if not instance_url or instance_url in processed:
                continue
            processed.add(instance_url)

            try:
                # Dataverse org APIs require an org-scoped token:
                # https://{org}.crm.dynamics.com/.default
                org_token = token
                if dataverse_token_resolver and instance_url:
                    resolved = await dataverse_token_resolver(instance_url)
                    if resolved:
                        org_token = resolved

                # Query workflows (classic) and processes
                wf_url = (
                    f"{instance_url}/api/data/v9.2/workflows"
                    "?$select=name,category,statecode,statuscode,modifiedon,createdon"
                    "&$filter=category eq 0 or category eq 5"
                    "&$top=5000"
                )
                workflows = await _get_pages(org_token, wf_url)

                active = 0
                suspended = 0
                # Query async operations to get run stats per workflow
                run_stats: dict[str, dict] = {}  # workflowid -> {total, succeeded, failed}
                try:
                    ops_url = (
                        f"{instance_url}/api/data/v9.2/asyncoperations"
                        "?$select=_regardingobjectid_value,statuscode"
                        "&$filter=operationtype eq 10"
                        "&$top=5000"
                    )
                    ops = await _get_pages(org_token, ops_url)
                    for op in ops:
                        wfid = op.get("_regardingobjectid_value", "")
                        if not wfid:
                            continue
                        stats = run_stats.setdefault(wfid, {"total": 0, "succeeded": 0, "failed": 0})
                        stats["total"] += 1
                        op_status = op.get("statuscode", 0)
                        if op_status == 30:  # Succeeded
                            stats["succeeded"] += 1
                        elif op_status == 31:  # Failed
                            stats["failed"] += 1
                except Exception:
                    gaps.add_gap(
                        module="Dynamics365",
                        field=f"workflow_runs_{domain_name}",
                        reason="Could not retrieve async operations for workflow run stats.",
                        severity="low",
                        remediation="Grant read access to asyncoperations entity.",
                    )

                for wf in workflows:
                    wfid = wf.get("workflowid", "")
                    state = wf.get("statecode", 0)
                    status = wf.get("statuscode", 0)
                    if state == 1:  # Activated
                        active += 1
                    else:
                        suspended += 1

                    wf_runs = run_stats.get(wfid, {})
                    total_runs = wf_runs.get("total", 0)
                    succeeded = wf_runs.get("succeeded", 0)
                    success_rate = round((succeeded / total_runs) * 100, 1) if total_runs > 0 else None

                    all_flows.append({
                        "name": wf.get("name", ""),
                        "category": "workflow" if wf.get("category") == 0 else "flow",
                        "state": "active" if state == 1 else "draft",
                        "status": status,
                        "modified_on": wf.get("modifiedon", ""),
                        "environment": domain_name,
                        "total_runs": total_runs if total_runs > 0 else None,
                        "success_rate": success_rate,
                    })
            except Exception as sub_exc:
                logger.warning("Workflow health for %s: %s", instance_url, sub_exc)
                status_code = getattr(getattr(sub_exc, "response", None), "status_code", None)
                if status_code in (401, 403):
                    gaps.add_gap(
                        module="Dynamics365",
                        field="workflows_access",
                        reason="Dataverse workflow access denied for one or more environments (401/403).",
                        severity="medium",
                        remediation="Grant Dataverse read access to workflows and async operations in each target environment.",
                    )
                    continue
                gaps.add_gap(
                    module="Dynamics365",
                    field=f"workflows_{domain_name}",
                    reason=_format_api_error(sub_exc),
                    severity="medium",
                    remediation="Ensure Dataverse read access to workflows.",
                )

        active_count = sum(1 for f in all_flows if f["state"] == "active")
        return {
            "workflows": all_flows,
            "total_count": len(all_flows),
            "active_count": active_count,
            "inactive_count": len(all_flows) - active_count,
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("Workflow health failed: %s", exc)
        gaps.add_gap(module="Dynamics365", field="workflows", reason=_format_api_error(exc), severity="high",
                     remediation="Provide a Dataverse-scoped token.")
        return {"workflows": [], "total_count": 0, "active_count": 0, "inactive_count": 0, "data_gaps": gaps.get_gaps()}


async def _get_bc_entity_counts(
    token: str, base_url: str, company_id: str, gaps: DataGapCollector,
) -> dict:
    """Fetch counts of customers, vendors, items, and GL entries for one BC company."""
    counts: dict[str, int | None] = {
        "customers_count": None,
        "vendors_count": None,
        "items_count": None,
        "gl_entries_count": None,
    }
    entity_map = {
        "customers_count": "customers",
        "vendors_count": "vendors",
        "items_count": "items",
        "gl_entries_count": "generalLedgerEntries",
    }
    for key, entity in entity_map.items():
        try:
            url = f"{base_url}/companies({company_id})/{entity}?$top=0&$count=true"
            data = await _get(token, url)
            counts[key] = data.get("@odata.count", len(data.get("value", [])))
        except Exception:
            pass  # leave as None, router alias already handles default
    return counts


async def get_bc_stats(token: str, gaps: DataGapCollector, *, dataverse_token: str | None = None) -> dict:
    """Business Central company and usage stats.

    Uses the BC standard API. Environments are discovered via Global
    Discovery (no admin needed). Requires a token scoped to
    ``https://api.businesscentral.dynamics.com/.default``.
    """
    try:
        if not token:
            gaps.add_gap(
                module="Dynamics365",
                field="bc_scope",
                reason="Business Central scope/token is not available for this profile.",
                severity="low",
                remediation="Grant and consent BC API scope (https://api.businesscentral.dynamics.com/.default) and reconnect profile authentication.",
            )
            return {"companies": [], "total_companies": 0, "bc_environments": 0, "data_gaps": gaps.get_gaps()}

        # Discover environments (Global Discovery → BAP fallback)
        envs = await discover_environments(
            dataverse_token=dataverse_token,
            bap_token=token,
        )

        # Filter for BC-type environments using normalised fields
        bc_envs = [
            e for e in envs
            if "businesscentral" in (e.get("type") or "").lower()
            or "business_central" in (e.get("type") or "").lower()
        ]

        companies: list[dict] = []

        if not bc_envs:
            # Try direct BC API — assume default tenant environment
            try:
                bc_url = "https://api.businesscentral.dynamics.com/v2.0/companies"
                data = await _get(token, bc_url)
                for c in data.get("value", []):
                    cid = c.get("id", "")
                    company = {
                        "id": cid,
                        "name": c.get("name", ""),
                        "display_name": c.get("displayName", c.get("name", "")),
                        "environment": "default",
                    }
                    company.update(await _get_bc_entity_counts(
                        token, "https://api.businesscentral.dynamics.com/v2.0", cid, gaps,
                    ))
                    companies.append(company)
            except Exception as exc:
                gaps.add_gap(
                    module="Dynamics365",
                    field="bc_companies",
                    reason=f"BC API not reachable: {_format_api_error(exc)}",
                    severity="medium",
                    remediation="Ensure BC API token scope and BC user licence.",
                )
        else:
            for env in bc_envs:
                env_name = env.get("display_name", "")
                instance_url = (env.get("instance_url") or "").rstrip("/")
                try:
                    bc_url = f"{instance_url}/api/v2.0/companies"
                    data = await _get(token, bc_url)
                    for c in data.get("value", []):
                        cid = c.get("id", "")
                        company = {
                            "id": cid,
                            "name": c.get("name", ""),
                            "display_name": c.get("displayName", c.get("name", "")),
                            "environment": env_name,
                        }
                        company.update(await _get_bc_entity_counts(
                            token, f"{instance_url}/api/v2.0", cid, gaps,
                        ))
                        companies.append(company)
                except Exception as exc:
                    gaps.add_gap(
                        module="Dynamics365",
                        field=f"bc_{env_name}",
                        reason=_format_api_error(exc),
                        severity="medium",
                        remediation="Ensure BC API access for this environment.",
                    )

        return {
            "companies": companies,
            "total_companies": len(companies),
            "bc_environments": len(bc_envs) if bc_envs else (1 if companies else 0),
            "data_gaps": gaps.get_gaps(),
        }
    except Exception as exc:
        logger.warning("BC stats failed: %s", exc)
        gaps.add_gap(module="Dynamics365", field="bc", reason=_format_api_error(exc), severity="high",
                     remediation="Provide a BC-scoped token.")
        return {"companies": [], "total_companies": 0, "bc_environments": 0, "data_gaps": gaps.get_gaps()}
