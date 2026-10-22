"""Inventory models — Subscription, ResourceGroup, Resource, DatabaseOverview, InventorySummary."""

from __future__ import annotations

from pydantic import BaseModel


class Subscription(BaseModel):
    subscription_id: str
    display_name: str
    state: str
    tenant_id: str


class ResourceGroup(BaseModel):
    name: str
    location: str
    subscription_id: str
    tags: dict[str, str] = {}
    provisioning_state: str = "Succeeded"
    resource_count: int = 0


class Resource(BaseModel):
    id: str
    name: str
    type: str
    location: str
    resource_group: str
    subscription_id: str
    tags: dict[str, str] = {}
    is_tagged: bool = False


class DatabaseOverview(BaseModel):
    resource_id: str
    resource_name: str
    database_type: str
    sku_tier: str | None = None
    sku_name: str | None = None
    max_size_gb: float | None = None
    current_size_gb: float | None = None
    dtu_capacity: int | None = None
    vcore_count: int | None = None
    status: str = "Online"
    subscription_id: str = ""
    resource_group: str = ""


class InventorySummary(BaseModel):
    total_subscriptions: int = 0
    total_resource_groups: int = 0
    total_resources: int = 0
    resources_by_type: dict[str, int] = {}
    resources_by_location: dict[str, int] = {}
    resources_by_resource_group: dict[str, int] = {}
    untagged_count: int = 0
    untagged_percentage: float = 0.0


class InventoryTreeNode(BaseModel):
    """Recursive tree node for the subscription → RG → resource tree view."""
    id: str
    name: str
    type: str  # subscription | resource_group | resource
    location: str | None = None
    resource_type: str | None = None
    children: list[InventoryTreeNode] = []
    tags: dict[str, str] = {}
