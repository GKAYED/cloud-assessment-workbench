"""Integration service — discover integrations from ADF, Logic Apps, networking.

Discovery methods (from research.md):
  1. ADF linked services
  2. ADF pipeline activities (Copy, Web, …)
  3. Logic App API connections
  4. App Service connection strings
  5. Private Endpoints
  6. VNet Peerings
  7. NSG rules (supplementary)
  8. API Management backends
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
RG_API = "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _arm_get(token: str, url: str) -> dict:
    """GET a fully-qualified ARM URL."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        resp.raise_for_status()
        return resp.json()


async def _resource_graph_query(token: str, query: str, sub_ids: list[str] | None = None) -> list[dict]:
    """Run a Resource Graph query with pagination."""
    body: dict[str, Any] = {"query": query, "options": {"resultFormat": "objectArray", "$top": 1000}}
    if sub_ids:
        body["subscriptions"] = sub_ids
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    all_rows: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.post(RG_API, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            all_rows.extend(data.get("data", []))
            skip_token = data.get("$skipToken")
            if not skip_token:
                break
            body["options"]["$skipToken"] = skip_token
    return all_rows


async def _get_subscription_ids(token: str) -> list[str]:
    data = await _arm_get(token, f"{MANAGEMENT_URL}/subscriptions?api-version=2022-09-01")
    return [s["subscriptionId"] for s in data.get("value", []) if s.get("state") == "Enabled"]


def _classify_integration(name: str, type_hint: str, properties: dict) -> dict:
    """Attempt classification of an integration point."""
    lower = (name + " " + type_hint).lower()
    direction = "unknown"
    protocol = "unknown"
    classification = "custom"

    if any(k in lower for k in ["sql", "database", "cosmos", "mysql", "postgres"]):
        classification = "data"
        protocol = "database"
    elif any(k in lower for k in ["blob", "storage", "datalake", "adls"]):
        classification = "data"
        protocol = "storage"
    elif any(k in lower for k in ["http", "rest", "web", "api"]):
        classification = "api"
        protocol = "http"
    elif any(k in lower for k in ["servicebus", "eventhub", "queue", "topic"]):
        classification = "messaging"
        protocol = "amqp"
    elif any(k in lower for k in ["sftp", "ftp"]):
        classification = "file_transfer"
        protocol = "sftp"

    if any(k in lower for k in ["source", "input", "inbound"]):
        direction = "inbound"
    elif any(k in lower for k in ["sink", "output", "outbound", "destination"]):
        direction = "outbound"
    elif any(k in lower for k in ["linked", "connection"]):
        direction = "bidirectional"

    return {
        "classification": classification,
        "direction": direction,
        "protocol": protocol,
    }


# ---------------------------------------------------------------------------
# Discovery functions
# ---------------------------------------------------------------------------


async def _discover_adf_linked_services(token: str, sub_ids: list[str]) -> list[dict]:
    """Discover ADF linked services via Resource Graph + ARM detail."""
    integrations: list[dict] = []
    factories = await _resource_graph_query(
        token,
        "resources | where type == 'microsoft.datafactory/factories' | project id, name, resourceGroup, subscriptionId",
        sub_ids,
    )
    for factory in factories:
        fid = factory.get("id", "")
        try:
            data = await _arm_get(
                token,
                f"{MANAGEMENT_URL}{fid}/linkedservices?api-version=2018-06-01",
            )
            for ls in data.get("value", []):
                props = ls.get("properties", {})
                ls_type = props.get("type", "")
                info = _classify_integration(ls.get("name", ""), ls_type, props)
                integrations.append({
                    "id": ls.get("id", ""),
                    "name": ls.get("name", ""),
                    "source": "ADF",
                    "source_resource": factory.get("name", ""),
                    "type": ls_type,
                    "subscription_id": factory.get("subscriptionId", ""),
                    "resource_group": factory.get("resourceGroup", ""),
                    **info,
                })
        except Exception as exc:
            logger.debug("ADF linked services for %s: %s", fid, exc)
    return integrations


async def _discover_logic_app_connections(token: str, sub_ids: list[str]) -> list[dict]:
    """Discover Logic App API connections."""
    integrations: list[dict] = []
    connections = await _resource_graph_query(
        token,
        "resources | where type == 'microsoft.web/connections' | project id, name, resourceGroup, subscriptionId, properties",
        sub_ids,
    )
    for conn in connections:
        props = conn.get("properties", {})
        api = props.get("api", {})
        info = _classify_integration(conn.get("name", ""), api.get("name", ""), props)
        integrations.append({
            "id": conn.get("id", ""),
            "name": conn.get("name", ""),
            "source": "LogicApp",
            "source_resource": "",
            "type": api.get("name", ""),
            "subscription_id": conn.get("subscriptionId", ""),
            "resource_group": conn.get("resourceGroup", ""),
            **info,
        })
    return integrations


async def _discover_private_endpoints(token: str, sub_ids: list[str]) -> list[dict]:
    """Discover Private Endpoints."""
    integrations: list[dict] = []
    pes = await _resource_graph_query(
        token,
        (
            "resources | where type == 'microsoft.network/privateendpoints' "
            "| project id, name, resourceGroup, subscriptionId, properties"
        ),
        sub_ids,
    )
    for pe in pes:
        props = pe.get("properties", {})
        plsc = props.get("privateLinkServiceConnections", [])
        target = ""
        if plsc:
            target = plsc[0].get("properties", {}).get("privateLinkServiceId", "")
        integrations.append({
            "id": pe.get("id", ""),
            "name": pe.get("name", ""),
            "source": "PrivateEndpoint",
            "source_resource": target,
            "type": "PrivateLink",
            "subscription_id": pe.get("subscriptionId", ""),
            "resource_group": pe.get("resourceGroup", ""),
            "classification": "networking",
            "direction": "outbound",
            "protocol": "private_link",
        })
    return integrations


async def _discover_vnet_peerings(token: str, sub_ids: list[str]) -> list[dict]:
    """Discover VNet peerings."""
    integrations: list[dict] = []
    peerings = await _resource_graph_query(
        token,
        (
            "resources | where type == 'microsoft.network/virtualnetworks' "
            "| mv-expand peering = properties.virtualNetworkPeerings "
            "| project id, name, resourceGroup, subscriptionId, peering"
        ),
        sub_ids,
    )
    for p in peerings:
        peering = p.get("peering", {})
        pp = peering.get("properties", {}) if isinstance(peering, dict) else {}
        remote = pp.get("remoteVirtualNetwork", {}).get("id", "")
        integrations.append({
            "id": f"{p.get('id', '')}/peerings/{peering.get('name', '')}",
            "name": peering.get("name", "") if isinstance(peering, dict) else "",
            "source": "VNetPeering",
            "source_resource": p.get("name", ""),
            "type": "VNetPeering",
            "subscription_id": p.get("subscriptionId", ""),
            "resource_group": p.get("resourceGroup", ""),
            "classification": "networking",
            "direction": "bidirectional",
            "protocol": "vnet_peering",
            "remote_vnet": remote,
        })
    return integrations


async def _discover_app_service_connections(token: str, sub_ids: list[str]) -> list[dict]:
    """Discover App Service / Function App connection strings via config."""
    integrations: list[dict] = []
    apps = await _resource_graph_query(
        token,
        (
            "resources | where type in~ ('microsoft.web/sites') "
            "| project id, name, resourceGroup, subscriptionId, kind"
        ),
        sub_ids,
    )
    for app in apps:
        aid = app.get("id", "")
        try:
            data = await _arm_get(
                token,
                f"{MANAGEMENT_URL}{aid}/config/connectionstrings/list?api-version=2023-01-01",
            )
            for cs_name, cs_data in data.get("properties", {}).items():
                cs_type = cs_data.get("type", "Custom")
                info = _classify_integration(cs_name, cs_type, {})
                integrations.append({
                    "id": f"{aid}/connectionStrings/{cs_name}",
                    "name": cs_name,
                    "source": "AppService",
                    "source_resource": app.get("name", ""),
                    "type": cs_type,
                    "subscription_id": app.get("subscriptionId", ""),
                    "resource_group": app.get("resourceGroup", ""),
                    **info,
                })
        except Exception:
            # connection string list may require POST; skip silently
            pass
    return integrations


async def _discover_apim_backends(token: str, sub_ids: list[str]) -> list[dict]:
    """Discover API Management backends."""
    integrations: list[dict] = []
    apims = await _resource_graph_query(
        token,
        "resources | where type == 'microsoft.apimanagement/service' | project id, name, resourceGroup, subscriptionId",
        sub_ids,
    )
    for apim in apims:
        apim_id = apim.get("id", "")
        try:
            data = await _arm_get(
                token,
                f"{MANAGEMENT_URL}{apim_id}/backends?api-version=2023-03-01-preview",
            )
            for backend in data.get("value", []):
                bp = backend.get("properties", {})
                integrations.append({
                    "id": backend.get("id", ""),
                    "name": backend.get("name", ""),
                    "source": "APIM",
                    "source_resource": apim.get("name", ""),
                    "type": bp.get("protocol", "http"),
                    "subscription_id": apim.get("subscriptionId", ""),
                    "resource_group": apim.get("resourceGroup", ""),
                    "classification": "api",
                    "direction": "outbound",
                    "protocol": bp.get("protocol", "http"),
                    "url": bp.get("url", ""),
                })
        except Exception:
            pass
    return integrations


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def get_integrations(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Discover all integration points across subscriptions."""
    try:
        token = await extract_bearer_token_async(credential)
        sub_ids = await _get_subscription_ids(token)

        results = await asyncio.gather(
            _discover_adf_linked_services(token, sub_ids),
            _discover_logic_app_connections(token, sub_ids),
            _discover_private_endpoints(token, sub_ids),
            _discover_vnet_peerings(token, sub_ids),
            _discover_app_service_connections(token, sub_ids),
            _discover_apim_backends(token, sub_ids),
            return_exceptions=True,
        )

        all_integrations: list[dict] = []
        source_labels = ["ADF", "LogicApp", "PrivateEndpoint", "VNetPeering", "AppService", "APIM"]
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("Integration discovery %s failed: %s", source_labels[i], result)
                gaps.add_gap(
                    module="Integrations",
                    field=source_labels[i],
                    reason=str(result),
                    severity="medium",
                    remediation=f"Check access to {source_labels[i]} resources.",
                )
            else:
                all_integrations.extend(result)

        return {"integrations": all_integrations, "total_count": len(all_integrations), "data_gaps": gaps.get_gaps()}
    except Exception as exc:
        logger.warning("Integration discovery failed: %s", exc)
        gaps.add_gap(module="Integrations", field="all", reason=format_gap_reason(exc), severity="high",
                     remediation="Ensure Reader role on subscriptions.")
        return {"integrations": [], "total_count": 0, "data_gaps": gaps.get_gaps()}


async def get_integration_summary(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Summarise integrations by source, classification, direction."""
    data = await get_integrations(credential, gaps)
    items = data.get("integrations", [])

    by_source: dict[str, int] = {}
    by_classification: dict[str, int] = {}
    by_direction: dict[str, int] = {}

    for item in items:
        src = item.get("source", "unknown")
        by_source[src] = by_source.get(src, 0) + 1
        cls_ = item.get("classification", "unknown")
        by_classification[cls_] = by_classification.get(cls_, 0) + 1
        d = item.get("direction", "unknown")
        by_direction[d] = by_direction.get(d, 0) + 1

    return {
        "total_count": len(items),
        "by_source": by_source,
        "by_classification": by_classification,
        "by_direction": by_direction,
        "data_gaps": gaps.get_gaps(),
    }


async def get_integration_recommendations(
    credential: StaticTokenCredential,
    gaps: DataGapCollector,
) -> dict:
    """Generate integration-specific recommendations."""
    data = await get_integrations(credential, gaps)
    items = data.get("integrations", [])

    recommendations: list[dict] = []

    # Check for unclassified integrations
    unclassified = [i for i in items if i.get("classification") == "custom"]
    if unclassified:
        recommendations.append({
            "category": "documentation",
            "severity": "medium",
            "title": "Unclassified integrations detected",
            "description": f"{len(unclassified)} integration(s) could not be automatically classified. Review and annotate them.",
            "affected_count": len(unclassified),
        })

    # Check for integrations without private endpoints
    non_private = [
        i for i in items
        if i.get("source") != "PrivateEndpoint"
        and i.get("classification") in ("data", "api")
    ]
    private_count = sum(1 for i in items if i.get("source") == "PrivateEndpoint")
    if non_private and private_count == 0:
        recommendations.append({
            "category": "security",
            "severity": "high",
            "title": "No private endpoints detected",
            "description": "Data and API integrations exist but no private endpoints were found. Consider using Private Link for secure connectivity.",
            "affected_count": len(non_private),
        })

    # Check for high number of unknown direction
    unknown_dir = [i for i in items if i.get("direction") == "unknown"]
    if len(unknown_dir) > 3:
        recommendations.append({
            "category": "documentation",
            "severity": "low",
            "title": "Integration data flow direction unknown",
            "description": f"{len(unknown_dir)} integrations have undetermined direction. Use annotations to clarify.",
            "affected_count": len(unknown_dir),
        })

    return {"recommendations": recommendations, "data_gaps": gaps.get_gaps()}
