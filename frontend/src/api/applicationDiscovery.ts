import { directGet, directPost } from './client';
import type {
  ApplicationDiscoveryAnnotation,
  ApplicationDiscoveryAnnotationCreate,
} from '../types';

export interface ApplicationDiscoveryAnnotationImportRow extends ApplicationDiscoveryAnnotationCreate {
  subscription_name?: string;
}

export const applicationDiscoveryApi = {
  listAnnotations: (profileId: number) =>
    directGet<ApplicationDiscoveryAnnotation[]>(
      `/api/application-discovery/annotations?profile_id=${profileId}`,
    ),

  upsertAnnotation: (profileId: number, body: ApplicationDiscoveryAnnotationCreate) =>
    directPost<ApplicationDiscoveryAnnotation>(
      `/api/application-discovery/annotations?profile_id=${profileId}`,
      body,
    ),

  importAnnotations: (profileId: number, rows: ApplicationDiscoveryAnnotationImportRow[]) =>
    directPost<ApplicationDiscoveryAnnotation[]>(
      `/api/application-discovery/annotations/import?profile_id=${profileId}`,
      rows,
    ),
};
