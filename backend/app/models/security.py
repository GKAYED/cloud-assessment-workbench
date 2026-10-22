"""Security models — AdvisorScore, AdvisorRecommendation, SecureScore."""

from __future__ import annotations

from pydantic import BaseModel


class AdvisorScore(BaseModel):
    pillar: str  # Reliability | Security | Cost | OperationalExcellence | Performance
    score: float = 0.0
    max_score: float = 100.0
    percentage: float = 0.0


class AdvisorRecommendation(BaseModel):
    id: str
    category: str
    impact: str  # High | Medium | Low
    resource_id: str = ""
    resource_type: str = ""
    description: str = ""
    remediation: str = ""
    subscription_id: str = ""


class SecureScore(BaseModel):
    subscription_id: str
    subscription_name: str = ""
    current_score: float = 0.0
    max_score: float = 0.0
    percentage: float = 0.0
