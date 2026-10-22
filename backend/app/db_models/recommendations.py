from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, _utcnow


class RecommendationDB(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    recommendation_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String, nullable=False, default="P2")
    category = Column(String, nullable=True)
    recommendation_type = Column(String, nullable=True)
    primary_outcome = Column(Text, nullable=True)
    why_it_matters = Column(Text, nullable=True)
    practical_next_step = Column(Text, nullable=True)
    evidence_sources = Column(Text, nullable=True)
    reinforcement_level = Column(String, nullable=True)
    manual_entry = Column(Boolean, nullable=False, default=False)
    validation_status = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="recommendations")
