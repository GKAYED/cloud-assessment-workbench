from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, _utcnow


class DynamicsManualContextDB(Base):
    __tablename__ = "dynamics_manual_contexts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    extra_environments = Column(Text, nullable=True)
    dataverse_capacity_notes = Column(Text, nullable=True)
    dataverse_license_notes = Column(Text, nullable=True)
    dataverse_cost_notes = Column(Text, nullable=True)
    discovery_gap_notes = Column(Text, nullable=True)
    additional_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="dynamics_manual_context")
