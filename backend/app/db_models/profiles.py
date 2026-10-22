from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db_base import Base, EncryptedText, _utcnow


class CustomerProfileDB(Base):
    __tablename__ = "customer_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_name = Column(String, nullable=False)
    tenant_id = Column(String, nullable=True)
    tenant_display_name = Column(String, nullable=True)
    last_assessed_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="Active")
    report_version = Column(String, nullable=False, default="legacy")
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    snapshots = relationship("AssessmentSnapshotDB", back_populates="profile", cascade="all, delete-orphan")
    portfolio_entries = relationship("AppPortfolioEntryDB", back_populates="profile", cascade="all, delete-orphan")
    initiatives = relationship("InitiativeDB", back_populates="profile", cascade="all, delete-orphan")
    recommendations = relationship("RecommendationDB", back_populates="profile", cascade="all, delete-orphan")
    challenges = relationship("ChallengeDB", back_populates="profile", cascade="all, delete-orphan")
    annotations = relationship("IntegrationAnnotationDB", back_populates="profile", cascade="all, delete-orphan")
    application_discovery_annotations = relationship(
        "ApplicationDiscoveryAnnotationDB", back_populates="profile", cascade="all, delete-orphan"
    )
    stakeholder_notes = relationship("StakeholderNoteDB", back_populates="profile", cascade="all, delete-orphan")
    dynamics_resource_overrides = relationship("DynamicsResourceOverrideDB", back_populates="profile", cascade="all, delete-orphan")
    dynamics_manual_context = relationship(
        "DynamicsManualContextDB", back_populates="profile", cascade="all, delete-orphan", uselist=False
    )
    organization_context = relationship("OrganizationContextDB", back_populates="profile", cascade="all, delete-orphan", uselist=False)
    report_settings = relationship("ReportSettingsDB", back_populates="profile", cascade="all, delete-orphan", uselist=False)
    framework_manual_caf = relationship("FrameworkManualCafDB", back_populates="profile", cascade="all, delete-orphan", uselist=False)
    assessment_process = relationship("AssessmentProcessDB", back_populates="profile", cascade="all, delete-orphan", uselist=False)
    integration_review = relationship("IntegrationReviewDB", back_populates="profile", cascade="all, delete-orphan", uselist=False)
    transcripts = relationship("TranscriptDB", back_populates="profile", cascade="all, delete-orphan")
    report_interpretation_runs = relationship(
        "ReportInterpretationRunDB", back_populates="profile", cascade="all, delete-orphan"
    )


class AssessmentSnapshotDB(Base):
    __tablename__ = "assessment_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    module_name = Column(String, nullable=False)
    data_json = Column(EncryptedText, nullable=False)
    snapshot_at = Column(DateTime, nullable=False, default=_utcnow)
    is_partial = Column(Boolean, nullable=False, default=False)

    profile = relationship("CustomerProfileDB", back_populates="snapshots")
