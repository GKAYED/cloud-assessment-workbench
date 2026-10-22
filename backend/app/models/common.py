"""Shared / common types used across multiple models."""

from __future__ import annotations

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    message: str


class LoadingStatus(BaseModel):
    module_name: str
    status: str  # pending | loading | success | error | partial
    message: str | None = None
    items_loaded: int | None = None
    started_at: str | None = None
    completed_at: str | None = None
