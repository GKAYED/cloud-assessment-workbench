from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, _utcnow


class IntegrationAnnotationDB(Base):
    __tablename__ = "integration_annotations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    integration_id = Column(String, nullable=False)
    is_manual = Column(Boolean, nullable=False, default=False)
    integration_name = Column(String, nullable=True)
    source_component = Column(String, nullable=True)
    target_endpoint = Column(String, nullable=True)
    source_application = Column(String, nullable=True)
    target_application = Column(String, nullable=True)
    logical_integration_group = Column(String, nullable=True)
    subscription_name = Column(String, nullable=True)
    resource_group_name = Column(String, nullable=True)
    integration_type = Column(String, nullable=True)
    protocol = Column(String, nullable=True)
    direction = Column(String, nullable=True)
    business_purpose = Column(Text, nullable=True)
    external_party_vendor = Column(String, nullable=True)
    owning_department = Column(String, nullable=True)
    business_owner = Column(String, nullable=True)
    criticality = Column(String, nullable=True)
    environment = Column(String, nullable=True)
    validation_status = Column(String, nullable=True)
    annotation_text = Column(Text, nullable=False, default="")
    annotated_by = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="annotations")


class ApplicationDiscoveryAnnotationDB(Base):
    __tablename__ = "application_discovery_annotations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    subscription_id = Column(String, nullable=False)
    resource_group = Column(String, nullable=False)
    business_description = Column(Text, nullable=True)
    owning_department = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="application_discovery_annotations")


class DynamicsResourceOverrideDB(Base):
    __tablename__ = "dynamics_resource_overrides"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    resource_id = Column(String, nullable=False)
    override_status = Column(String, nullable=False, default="Unknown")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="dynamics_resource_overrides")


class IntegrationReviewDB(Base):
    __tablename__ = "integration_review"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    items_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="integration_review")
