from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, _utcnow


class OrganizationContextDB(Base):
    __tablename__ = "organization_contexts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    organisation_size = Column(String, nullable=True)
    organisation_overview = Column(Text, nullable=True)
    assessment_scope_notes = Column(Text, nullable=True)
    assessment_boundary_notes = Column(Text, nullable=True)
    leadership_context_notes = Column(Text, nullable=True)
    operating_model_notes = Column(Text, nullable=True)
    it_team_summary = Column(Text, nullable=True)
    vendor_dependency_notes = Column(Text, nullable=True)
    tailoring_notes = Column(Text, nullable=True)
    org_structure_image_name = Column(String, nullable=True)
    org_structure_image_data = Column(Text, nullable=True)
    it_team_structure_image_name = Column(String, nullable=True)
    it_team_structure_image_data = Column(Text, nullable=True)
    it_team_structure_images_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="organization_context")
