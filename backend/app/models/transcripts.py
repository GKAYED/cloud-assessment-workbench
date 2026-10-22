"""Profile-scoped transcript storage and generated markdown artefacts."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TranscriptTargetBase(BaseModel):
    name: str
    description: str | None = None


class TranscriptTargetCreate(TranscriptTargetBase):
    pass


class TranscriptTarget(TranscriptTargetBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TranscriptArtifactBase(BaseModel):
    kind: str
    title: str
    description: str | None = None
    markdown_content: str


class TranscriptArtifactUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    markdown_content: str | None = None


class TranscriptArtifact(TranscriptArtifactBase):
    id: int
    transcript_id: int
    target_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TranscriptBase(BaseModel):
    title: str
    source_label: str | None = None
    transcript_text: str


class TranscriptCreate(TranscriptBase):
    extraction_targets: list[TranscriptTargetCreate] = []


class Transcript(TranscriptBase):
    id: int
    profile_id: int
    status: str
    targets: list[TranscriptTarget]
    artifacts: list[TranscriptArtifact]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExistingMarkdownReference(BaseModel):
    id: str
    title: str
    relative_path: str


class ExistingMarkdownContent(BaseModel):
    id: str
    title: str
    relative_path: str
    content: str


class TranscriptProcessingStatus(BaseModel):
    enabled: bool
    model: str | None = None
