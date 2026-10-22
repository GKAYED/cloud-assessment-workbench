from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db_base import Base, _utcnow


class AppPortfolioEntryDB(Base):
    __tablename__ = "app_portfolio_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("customer_profiles.id", ondelete="CASCADE"), nullable=False)
    app_name = Column(String, nullable=False)
    purpose = Column(Text, nullable=True)
    business_owner = Column(String, nullable=True)
    technical_owner = Column(String, nullable=True)
    vendor = Column(String, nullable=True)
    support_model = Column(String, nullable=True)
    current_hosting = Column(String, nullable=True)
    status = Column(String, nullable=True)
    criticality = Column(String, nullable=True)
    linked_resource_ids = Column(Text, nullable=True)
    monthly_cost = Column(String, nullable=True)
    business_value = Column(Integer, nullable=True)
    technical_fitness = Column(Integer, nullable=True)
    complexity = Column(Integer, nullable=True)
    strategic_fit = Column(Integer, nullable=True)
    time_classification = Column(String, nullable=True)
    future_state = Column(Text, nullable=True)
    known_risks = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    profile = relationship("CustomerProfileDB", back_populates="portfolio_entries")
