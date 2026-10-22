from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, EncryptedText, _utcnow


class TranscriptDB(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    source_label = Column(String, nullable=True)
    transcript_text = Column(EncryptedText, nullable=False)
    status = Column(String, nullable=False, default="Scaffolded")
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="transcripts")
    targets = relationship("TranscriptTargetDB", back_populates="transcript", cascade="all, delete-orphan")
    artifacts = relationship("TranscriptArtifactDB", back_populates="transcript", cascade="all, delete-orphan")


class TranscriptTargetDB(Base):
    __tablename__ = "transcript_targets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    transcript_id = Column(Integer, ForeignKey("transcripts.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    transcript = relationship("TranscriptDB", back_populates="targets")
    artifacts = relationship("TranscriptArtifactDB", back_populates="target")


class TranscriptArtifactDB(Base):
    __tablename__ = "transcript_artifacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    transcript_id = Column(Integer, ForeignKey("transcripts.id", ondelete="CASCADE"), nullable=False)
    target_id = Column(Integer, ForeignKey("transcript_targets.id"), nullable=True)
    kind = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    markdown_content = Column(EncryptedText, nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    transcript = relationship("TranscriptDB", back_populates="artifacts")
    target = relationship("TranscriptTargetDB", back_populates="artifacts")
