from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, _utcnow


class ReportSettingsDB(Base):
    __tablename__ = "report_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    visible_sections_json = Column(Text, nullable=True)
    appendix_sections_json = Column(Text, nullable=True)
    release_mode = Column(String, nullable=False, default="draft")
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="report_settings")


class FrameworkManualCafDB(Base):
    __tablename__ = "framework_manual_caf"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    ratings_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="framework_manual_caf")


class AssessmentProcessDB(Base):
    __tablename__ = "assessment_process"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False, unique=True)
    checklist_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="assessment_process")


class ReportInterpretationRunDB(Base):
    __tablename__ = "report_interpretation_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    report_version = Column(String, nullable=False, default="v2")
    status = Column(String, nullable=False, default="draft")
    approved = Column(Boolean, nullable=False, default=False)
    is_current = Column(Boolean, nullable=False, default=True)
    generation_trigger = Column(String, nullable=False, default="generate")
    source_snapshot_at = Column(DateTime, nullable=True)
    source_profile_updated_at = Column(DateTime, nullable=True)
    generated_at = Column(DateTime, nullable=False, default=_utcnow)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String, nullable=True)
    generation_model = Column(String, nullable=True)
    generation_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="report_interpretation_runs")
    sections = relationship("ReportInterpretationSectionDB", back_populates="run", cascade="all, delete-orphan")


class ReportInterpretationSectionDB(Base):
    __tablename__ = "report_interpretation_sections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("report_interpretation_runs.id", ondelete="CASCADE"), nullable=False)
    section_key = Column(String, nullable=False)
    source_kind = Column(String, nullable=False, default="generated")
    generated_text = Column(Text, nullable=True)
    edited_text = Column(Text, nullable=True)
    final_text = Column(Text, nullable=True)
    last_edited_at = Column(DateTime, nullable=True)
    last_edited_by = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    run = relationship("ReportInterpretationRunDB", back_populates="sections")
