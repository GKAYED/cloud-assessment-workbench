import { directGet, directPost, put } from './client';
import type {
  IntegrationPoint,
  IntegrationAnnotation,
  IntegrationAnnotationCreate,
  IntegrationSummary,
  IntegrationRecommendation,
} from '../types';

export interface IntegrationAnnotationImportRow extends IntegrationAnnotationCreate {
  row_type?: string;
  name?: string;
  source_resource_name?: string;
  target_name?: string;
}

export const integrationsApi = {
  list: () => directGet<IntegrationPoint[]>('/api/integrations'),
  summary: () => directGet<IntegrationSummary>('/api/integrations/summary'),
  recommendations: () => directGet<IntegrationRecommendation[]>('/api/integrations/recommendations'),
  listAnnotations: (profileId: number) =>
    directGet<IntegrationAnnotation[]>(`/api/integrations/annotations?profile_id=${profileId}`),
  upsertAnnotation: (profileId: number, body: IntegrationAnnotationCreate) =>
    directPost<IntegrationAnnotation>(`/api/integrations/annotations?profile_id=${profileId}`, body),
  importAnnotations: (profileId: number, rows: IntegrationAnnotationImportRow[]) =>
    directPost<IntegrationAnnotation[]>(`/api/integrations/annotations/import?profile_id=${profileId}`, rows),
  updateAnnotation: (id: number, body: IntegrationAnnotationCreate) =>
    put<IntegrationAnnotation>(`/api/integrations/annotations/${id}`, body),
};
