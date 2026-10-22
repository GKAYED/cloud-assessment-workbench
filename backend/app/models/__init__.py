"""Models package — re-exports all Pydantic schemas for convenience."""

from app.models.common import ErrorResponse, LoadingStatus
from app.models.assessment_process import AssessmentProcessRecord, AssessmentProcessUpdate
from app.models.integration_review import (
    IntegrationReviewItem,
    IntegrationReviewRecord,
    IntegrationReviewUpdate,
)
from app.models.application_discovery import (
    ApplicationDiscoveryAnnotation,
    ApplicationDiscoveryAnnotationCreate,
    ApplicationDiscoveryAnnotationImportRow,
)
from app.models.challenge import Challenge, ChallengeCreate, ChallengeUpdate
from app.models.costs import CostRecord, CostRollup, CostSummary
from app.models.dynamics import (
    D365BCStats,
    D365Environment,
    D365ModuleStats,
    D365User,
    D365WorkflowHealth,
)
from app.models.dynamics_context import DynamicsManualContext, DynamicsManualContextUpdate
from app.models.framework_manual_caf import FrameworkManualCafRecord, FrameworkManualCafUpdate
from app.models.initiative import Initiative, InitiativeCreate, InitiativeUpdate
from app.models.insights import DataGap, ExecutiveInsight
from app.models.integrations import (
    IntegrationAnnotation,
    IntegrationAnnotationCreate,
    IntegrationAnnotationUpdate,
    IntegrationPoint,
    IntegrationRecommendation,
    IntegrationSummary,
)
from app.models.inventory import (
    DatabaseOverview,
    InventorySummary,
    InventoryTreeNode,
    Resource,
    ResourceGroup,
    Subscription,
)
from app.models.licenses import LicenseSKU, LicenseSummary, UserLicense
from app.models.portfolio import (
    AppPortfolioEntry,
    AppPortfolioEntryCreate,
    AppPortfolioEntryUpdate,
)
from app.models.stakeholders import (
    StakeholderNote,
    StakeholderNoteCreate,
    StakeholderNoteUpdate,
)
from app.models.profiles import (
    CustomerProfile,
    CustomerProfileCreate,
    CustomerProfileList,
    CustomerProfileUpdate,
    ProfileActivateResponse,
    SnapshotLoadResponse,
    SnapshotModuleResponse,
    SnapshotSaveRequest,
    SnapshotSaveResponse,
)
from app.models.recommendation import (
    Recommendation,
    RecommendationCreate,
    RecommendationUpdate,
)
from app.models.report_settings import ReportSettings, ReportSettingsUpdate
from app.models.report_interpretation import (
    ReportInterpretationApproveRequest,
    ReportInterpretationGenerateRequest,
    ReportInterpretationRun,
    ReportInterpretationSection,
    ReportInterpretationSectionUpdate,
    ReportInterpretationState,
)
from app.models.security import AdvisorRecommendation, AdvisorScore, SecureScore

__all__ = [
    # Common
    "ErrorResponse",
    "LoadingStatus",
    "AssessmentProcessRecord",
    "AssessmentProcessUpdate",
    "IntegrationReviewItem",
    "IntegrationReviewRecord",
    "IntegrationReviewUpdate",
    "ApplicationDiscoveryAnnotation",
    "ApplicationDiscoveryAnnotationCreate",
    "ApplicationDiscoveryAnnotationImportRow",
    # Challenges
    "Challenge",
    "ChallengeCreate",
    "ChallengeUpdate",
    # Profiles
    "CustomerProfile",
    "CustomerProfileCreate",
    "CustomerProfileUpdate",
    "CustomerProfileList",
    "ProfileActivateResponse",
    "SnapshotSaveRequest",
    "SnapshotSaveResponse",
    "SnapshotLoadResponse",
    "SnapshotModuleResponse",
    # Inventory
    "Subscription",
    "ResourceGroup",
    "Resource",
    "DatabaseOverview",
    "InventorySummary",
    "InventoryTreeNode",
    # Costs
    "CostRecord",
    "CostRollup",
    "CostSummary",
    # Security
    "AdvisorScore",
    "AdvisorRecommendation",
    "SecureScore",
    # Integrations
    "IntegrationPoint",
    "IntegrationAnnotation",
    "IntegrationAnnotationCreate",
    "IntegrationAnnotationUpdate",
    "IntegrationSummary",
    "IntegrationRecommendation",
    # Dynamics
    "D365Environment",
    "D365User",
    "D365ModuleStats",
    "D365WorkflowHealth",
    "D365BCStats",
    "DynamicsManualContext",
    "DynamicsManualContextUpdate",
    "FrameworkManualCafRecord",
    "FrameworkManualCafUpdate",
    # Licenses
    "LicenseSKU",
    "UserLicense",
    "LicenseSummary",
    # Portfolio
    "AppPortfolioEntry",
    "AppPortfolioEntryCreate",
    "AppPortfolioEntryUpdate",
    # Initiatives
    "Initiative",
    "InitiativeCreate",
    "InitiativeUpdate",
    # Recommendations
    "Recommendation",
    "RecommendationCreate",
    "RecommendationUpdate",
    "ReportSettings",
    "ReportSettingsUpdate",
    "ReportInterpretationRun",
    "ReportInterpretationSection",
    "ReportInterpretationState",
    "ReportInterpretationGenerateRequest",
    "ReportInterpretationSectionUpdate",
    "ReportInterpretationApproveRequest",
    # Stakeholders
    "StakeholderNote",
    "StakeholderNoteCreate",
    "StakeholderNoteUpdate",
    # Insights
    "ExecutiveInsight",
    "DataGap",
]
