"""ORM model package."""

from app.db_models.challenges import ChallengeDB
from app.db_models.dynamics import DynamicsManualContextDB
from app.db_models.integrations import (
    ApplicationDiscoveryAnnotationDB,
    DynamicsResourceOverrideDB,
    IntegrationAnnotationDB,
    IntegrationReviewDB,
)
from app.db_models.initiatives import InitiativeDB
from app.db_models.organization import OrganizationContextDB
from app.db_models.portfolio import AppPortfolioEntryDB
from app.db_models.profiles import AssessmentSnapshotDB, CustomerProfileDB
from app.db_models.recommendations import RecommendationDB
from app.db_models.reporting import (
    AssessmentProcessDB,
    FrameworkManualCafDB,
    ReportInterpretationRunDB,
    ReportInterpretationSectionDB,
    ReportSettingsDB,
)
from app.db_models.stakeholders import StakeholderNoteDB
from app.db_models.transcripts import TranscriptArtifactDB, TranscriptDB, TranscriptTargetDB

__all__ = [
    "CustomerProfileDB",
    "AssessmentSnapshotDB",
    "AppPortfolioEntryDB",
    "InitiativeDB",
    "RecommendationDB",
    "ChallengeDB",
    "StakeholderNoteDB",
    "IntegrationAnnotationDB",
    "ApplicationDiscoveryAnnotationDB",
    "DynamicsResourceOverrideDB",
    "OrganizationContextDB",
    "DynamicsManualContextDB",
    "TranscriptDB",
    "TranscriptTargetDB",
    "TranscriptArtifactDB",
    "ReportSettingsDB",
    "FrameworkManualCafDB",
    "AssessmentProcessDB",
    "IntegrationReviewDB",
    "ReportInterpretationRunDB",
    "ReportInterpretationSectionDB",
]
