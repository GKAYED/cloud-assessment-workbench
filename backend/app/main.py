"""Cloud Assessment Workbench Backend — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db import init_db
from app.local_session import LocalSessionMiddleware, initialize_local_session, router as session_router
from app.services.encryption import ensure_field_encryption_ready

# Import routers
from app.routers import (
    assessment_process,
    application_discovery,
    auth,
    challenges,
    costs,
    data_gaps,
    data_pull,
    dynamics,
    dynamics_context,
    dynamics_overrides,
    framework,
    governance,
    integration_review,
    initiatives,
    insights,
    integrations,
    inventory,
    licenses,
    organization,
    portfolio,
    profiles,
    questionnaire,
    report_interpretation,
    recommendations,
    report_settings,
    security,
    stakeholders,
    transcripts,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    initialize_local_session()
    ensure_field_encryption_ready()
    await init_db()
    yield


app = FastAPI(
    title="Cloud Assessment Workbench",
    description="Azure Assessment Portal API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(LocalSessionMiddleware)

# CORS — allow the Vite dev server and any configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session endpoints are also protected by local Host/Origin checks.
app.include_router(session_router)

# Register routers
app.include_router(auth.router)
app.include_router(challenges.router)
app.include_router(profiles.router)
app.include_router(assessment_process.router)
app.include_router(integration_review.router)
app.include_router(application_discovery.router)
app.include_router(organization.router)
app.include_router(transcripts.router)
app.include_router(data_pull.router)
app.include_router(inventory.router)
app.include_router(costs.router)
app.include_router(security.router)
app.include_router(integrations.router)
app.include_router(dynamics.router)
app.include_router(dynamics_context.router)
app.include_router(dynamics_overrides.router)
app.include_router(licenses.router)
app.include_router(portfolio.router)
app.include_router(initiatives.router)
app.include_router(recommendations.router)
app.include_router(report_settings.router)
app.include_router(insights.router)
app.include_router(data_gaps.router)
app.include_router(framework.router)
app.include_router(questionnaire.router)
app.include_router(stakeholders.router)
app.include_router(governance.router)
app.include_router(report_interpretation.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
