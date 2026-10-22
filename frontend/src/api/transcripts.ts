import { del, get, post, put } from './client';
import type {
  ExistingMarkdownContent,
  ExistingMarkdownReference,
  Transcript,
  TranscriptArtifact,
  TranscriptArtifactUpdate,
  TranscriptCreate,
  TranscriptProcessingStatus,
} from '../types';

export const transcriptsApi = {
  list: (profileId: number) =>
    get<Transcript[]>(`/api/transcripts?profile_id=${profileId}`),

  create: (profileId: number, body: TranscriptCreate) =>
    post<Transcript>(`/api/transcripts?profile_id=${profileId}`, body),

  delete: (id: number) =>
    del(`/api/transcripts/${id}`),

  updateArtifact: (artifactId: number, body: TranscriptArtifactUpdate) =>
    put<TranscriptArtifact>(`/api/transcripts/artifacts/${artifactId}`, body),

  processingStatus: () =>
    get<TranscriptProcessingStatus>('/api/transcripts/processing-status'),

  listReferences: () =>
    get<ExistingMarkdownReference[]>('/api/transcripts/references'),

  getReferenceContent: (path: string) =>
    get<ExistingMarkdownContent>(`/api/transcripts/references/content?path=${encodeURIComponent(path)}`),
};
