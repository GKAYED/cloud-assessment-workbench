from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, _utcnow


class InitiativeDB(Base):
    __tablename__ = "initiatives"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="Planned")
    priority = Column(String, nullable=False, default="Medium")
    complexity = Column(Integer, nullable=True)
    strategic_fit = Column(Integer, nullable=True)
    linked_app_ids = Column(Text, nullable=True)
    dependency_ids = Column(Text, nullable=True)
    lane = Column(String, nullable=True)
    planned_start_quarter = Column(String, nullable=True)
    planned_end_quarter = Column(String, nullable=True)
    target_quarter = Column(String, nullable=True)
    category = Column(String, nullable=True)
    estimated_effort_weeks = Column(String, nullable=True)
    estimated_cost_saving = Column(String, nullable=True)
    business_owner = Column(String, nullable=True)
    technical_owner = Column(String, nullable=True)
    validation_status = Column(String, nullable=True)
    evidence_confidence = Column(String, nullable=True)
    parent_initiative_id = Column(Integer, ForeignKey("initiatives.id"), nullable=True)
    deprecation_aligned_override = Column(Boolean, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="initiatives")
