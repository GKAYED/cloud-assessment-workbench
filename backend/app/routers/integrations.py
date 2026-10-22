"""Integrations router — ADF, Logic Apps, networking integrations.

Endpoints:
  GET /api/integrations
  GET /api/integrations/summary
  GET /api/integrations/recommendations
  POST /api/integrations/annotations  (profile-scoped)
  PUT  /api/integrations/annotations/{id}
"""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import IntegrationAnnotationDB
from app.dependencies import get_credential, get_db, get_gap_collector
from app.models.integrations import (
    IntegrationAnnotation,
    IntegrationAnnotationCreate,
    IntegrationAnnotationImportRow,
    IntegrationAnnotationUpdate,
)
from app.services.azure_auth import StaticTokenCredential
from app.services.data_gap_collector import DataGapCollector

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


def _clean_text(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _is_unknown(value: str) -> bool:
    return value.strip().lower() in {"", "unknown", "n/a", "na", "none", "null", "undefined"}


def _resource_name_from_id(resource_id: str) -> str:
    parts = [p for p in resource_id.strip("/").split("/") if p]
    return parts[-1] if parts else ""


def _host_from_url(url: str) -> str:
    if _is_unknown(url):
        return ""
    try:
        parsed = urlparse(url)
        if parsed.netloc:
            return parsed.netloc
        return parsed.path.split("/")[0] if parsed.path else ""
    except Exception:
        return ""


def _normalise_direction(direction: object) -> str:
    value = _clean_text(direction).lower()
    if value == "inbound":
        return "Inbound"
    if value == "outbound":
        return "Outbound"
    if value == "bidirectional":
        return "Bidirectional"
    return "Unknown" if _is_unknown(value) else _clean_text(direction)


def _optional_text(value: object) -> str | None:
    text = _clean_text(value)
    return text or None


async def _find_annotation(
    db: AsyncSession,
    profile_id: int,
    integration_id: str,
) -> IntegrationAnnotationDB | None:
    result = await db.execute(
        select(IntegrationAnnotationDB).where(
            IntegrationAnnotationDB.profile_id == profile_id,
            IntegrationAnnotationDB.integration_id == integration_id.strip(),
        )
    )
    return result.scalar_one_or_none()


def _apply_annotation_body(row: IntegrationAnnotationDB, body: IntegrationAnnotationCreate | IntegrationAnnotationUpdate) -> None:
    is_manual = getattr(body, "is_manual", None)
    if is_manual is not None:
        row.is_manual = bool(is_manual)
    row.integration_name = _optional_text(getattr(body, "integration_name", None))
    row.source_component = _optional_text(getattr(body, "source_component", None))
    row.target_endpoint = _optional_text(getattr(body, "target_endpoint", None))
    row.source_application = _optional_text(getattr(body, "source_application", None))
    row.target_application = _optional_text(getattr(body, "target_application", None))
    row.logical_integration_group = _optional_text(getattr(body, "logical_integration_group", None))
    row.subscription_name = _optional_text(getattr(body, "subscription_name", None))
    row.resource_group_name = _optional_text(getattr(body, "resource_group_name", None))
    row.integration_type = _optional_text(getattr(body, "integration_type", None))
    row.protocol = _optional_text(getattr(body, "protocol", None))
    row.direction = _optional_text(getattr(body, "direction", None))
    row.business_purpose = _optional_text(getattr(body, "business_purpose", None))
    row.external_party_vendor = _optional_text(getattr(body, "external_party_vendor", None))
    row.owning_department = _optional_text(getattr(body, "owning_department", None))
    row.business_owner = _optional_text(getattr(body, "business_owner", None))
    row.criticality = _optional_text(getattr(body, "criticality", None))
    row.environment = _optional_text(getattr(body, "environment", None))
    row.validation_status = _optional_text(getattr(body, "validation_status", None))
    row.annotation_text = _clean_text(getattr(body, "annotation_text", None))
    row.annotated_by = _optional_text(getattr(body, "annotated_by", None))


def _infer_target_system(integration_type: str, candidate: str, url: str, remote_vnet: str) -> str:
    if not _is_unknown(url):
        return "External Endpoint"
    if not _is_unknown(remote_vnet):
        return "Virtual Network"

    text = f"{integration_type} {candidate}".lower()
    if any(k in text for k in ("cosmos",)):
        return "Azure Cosmos DB"
    if any(k in text for k in ("sql", "postgres", "mysql", "mariadb")):
        return "Azure SQL / Database"
    if any(k in text for k in ("blob", "storage", "adls", "datalake")):
        return "Azure Storage"
    if any(k in text for k in ("servicebus", "eventhub", "queue", "topic")):
        return "Messaging"
    if any(k in text for k in ("keyvault", "secret")):
        return "Azure Key Vault"
    if any(k in text for k in ("http", "rest", "api", "webhook")):
        return "HTTP API"
    if any(k in text for k in ("vnet", "private", "network")):
        return "Networking"
    return ""


@router.get("")
async def list_integrations(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.integration_service import get_integrations
    result = await get_integrations(credential, gaps)
    if isinstance(result, dict):
        items = result.get("integrations", [])
        # Add alias fields matching demo shape
        for i in items:
            source = _clean_text(i.get("source"))
            source_resource = _clean_text(i.get("source_resource"))
            integration_name = _clean_text(i.get("name"))
            integration_type = _clean_text(i.get("type"))
            remote_vnet = _clean_text(i.get("remote_vnet"))
            url = _clean_text(i.get("url"))

            target_resource_id = _clean_text(i.get("target_resource_id")) or remote_vnet or url

            target_name = _clean_text(i.get("target_name"))
            if _is_unknown(target_name):
                if not _is_unknown(remote_vnet):
                    target_name = _resource_name_from_id(remote_vnet)
                elif not _is_unknown(url):
                    target_name = _host_from_url(url)
                elif source in {"APIM", "LogicApp"} and not _is_unknown(integration_name):
                    target_name = integration_name
                elif not _is_unknown(integration_type):
                    target_name = integration_type

            target_system = _clean_text(i.get("target_system"))
            if _is_unknown(target_system):
                target_system = _infer_target_system(integration_type, target_name, url, remote_vnet)

            target_type = _clean_text(i.get("target_type")) or integration_type
            if _is_unknown(target_type) and not _is_unknown(url):
                target_type = "ExternalEndpoint"

            if _is_unknown(target_name):
                target_name = target_system or "Unresolved target"

            i["source_system"] = source or _clean_text(i.get("source_system")) or "Unknown source"
            i["source_resource_name"] = source_resource or i["source_system"]
            i["source_resource_id"] = _clean_text(i.get("source_resource_id")) or _clean_text(i.get("id"))
            i["source_resource_type"] = _clean_text(i.get("source_resource_type")) or source or "Unknown"
            i["integration_type"] = integration_type or _clean_text(i.get("integration_type")) or "Unknown"
            i["direction"] = _normalise_direction(i.get("direction"))
            i["azure_service"] = _clean_text(i.get("azure_service")) or source
            i["target_resource_id"] = target_resource_id
            i["target_name"] = target_name
            i["target_type"] = target_type or "Unknown"
            i["target_system"] = target_system or "Unresolved target"
            i.setdefault("health_status", None)
            i.setdefault("details", i.get("classification", ""))
            i.setdefault("is_deprecated_source", False)
            i.setdefault("is_deprecated_target", False)
            i.setdefault("annotation", None)
        return items
    return result


@router.get("/summary")
async def integration_summary(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.integration_service import get_integration_summary
    result = await get_integration_summary(credential, gaps)
    if isinstance(result, dict):
        # Add alias fields matching demo shape
        result.setdefault("total_integrations", result.get("total_count", 0))
        result.setdefault("by_type", result.get("by_source", {}))
        result.setdefault("deprecated_count", 0)
        result.setdefault("health_measured", False)
    return result


@router.get("/recommendations")
async def integration_recommendations(
    credential: StaticTokenCredential = Depends(get_credential),
    gaps: DataGapCollector = Depends(get_gap_collector),
):
    from app.services.integration_service import get_integration_recommendations
    result = await get_integration_recommendations(credential, gaps)
    if isinstance(result, dict):
        recs = result.get("recommendations", [])
        # Add alias fields matching demo shape
        for r in recs:
            r.setdefault("priority", r.get("severity", "medium"))
            r.setdefault("affected_integrations", [])
        return recs
    return result


# ---- Annotations (profile-scoped) -----------------------------------------


@router.post("/annotations", response_model=IntegrationAnnotation, status_code=201)
async def create_annotation(
    body: IntegrationAnnotationCreate,
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    ann = await _find_annotation(db, profile_id, body.integration_id)
    if ann:
        _apply_annotation_body(ann, body)
        await db.commit()
        await db.refresh(ann)
        return IntegrationAnnotation.model_validate(ann)

    ann = IntegrationAnnotationDB(
        profile_id=profile_id,
        integration_id=body.integration_id.strip(),
        is_manual=bool(body.is_manual),
        annotation_text="",
    )
    _apply_annotation_body(ann, body)
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return IntegrationAnnotation.model_validate(ann)


@router.put("/annotations/{annotation_id}", response_model=IntegrationAnnotation)
async def update_annotation(
    annotation_id: int,
    body: IntegrationAnnotationUpdate,
    db: AsyncSession = Depends(get_db),
):
    ann = await db.get(IntegrationAnnotationDB, annotation_id)
    if not ann:
        raise HTTPException(404, detail="Annotation not found")
    _apply_annotation_body(ann, body)
    await db.commit()
    await db.refresh(ann)
    return IntegrationAnnotation.model_validate(ann)


@router.get("/annotations")
async def list_annotations(
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IntegrationAnnotationDB)
        .where(IntegrationAnnotationDB.profile_id == profile_id)
        .order_by(IntegrationAnnotationDB.integration_id)
    )
    rows = result.scalars().all()
    return [IntegrationAnnotation.model_validate(r) for r in rows]


@router.post("/annotations/import", response_model=list[IntegrationAnnotation])
async def import_annotations(
    rows: list[IntegrationAnnotationImportRow],
    profile_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    saved: list[IntegrationAnnotation] = []

    for item in rows:
        integration_id = _clean_text(item.integration_id)
        if _is_unknown(integration_id):
            continue

        has_context = any([
            item.is_manual,
            _optional_text(item.integration_name),
            _optional_text(item.source_component),
            _optional_text(item.target_endpoint),
            _optional_text(item.source_application),
            _optional_text(item.target_application),
            _optional_text(item.logical_integration_group),
            _optional_text(item.subscription_name),
            _optional_text(item.resource_group_name),
            _optional_text(item.integration_type),
            _optional_text(item.protocol),
            _optional_text(item.direction),
            _optional_text(item.business_purpose),
            _optional_text(item.external_party_vendor),
            _optional_text(item.owning_department),
            _optional_text(item.business_owner),
            _optional_text(item.criticality),
            _optional_text(item.environment),
            _optional_text(item.validation_status),
            _optional_text(item.annotation_text),
        ])
        if not has_context:
            continue

        existing = await _find_annotation(db, profile_id, integration_id)
        if existing:
            _apply_annotation_body(existing, item)
            saved.append(IntegrationAnnotation.model_validate(existing))
            continue

        row = IntegrationAnnotationDB(
            profile_id=profile_id,
            integration_id=integration_id,
            is_manual=bool(item.is_manual),
            annotation_text="",
        )
        _apply_annotation_body(row, item)
        db.add(row)
        await db.flush()
        saved.append(IntegrationAnnotation.model_validate(row))

    await db.commit()
    return saved
