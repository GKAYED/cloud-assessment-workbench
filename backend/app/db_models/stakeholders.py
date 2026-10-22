from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, EncryptedText, _utcnow


class StakeholderNoteDB(Base):
    __tablename__ = "stakeholder_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    stakeholder_name = Column(EncryptedText, nullable=False)
    role = Column(EncryptedText, nullable=True)
    department = Column(EncryptedText, nullable=True)
    interview_date = Column(EncryptedText, nullable=True)
    notes = Column(EncryptedText, nullable=True)
    key_findings = Column(EncryptedText, nullable=True)
    pain_points = Column(EncryptedText, nullable=True)
    source_meeting = Column(EncryptedText, nullable=True)
    validation_status = Column(String, nullable=True)
    linked_app_ids = Column(Text, nullable=True)
    linked_initiative_ids = Column(Text, nullable=True)
    tags = Column(EncryptedText, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="stakeholder_notes")
