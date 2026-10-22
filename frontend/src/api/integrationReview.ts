import { directGet, put } from './client';
import type { IntegrationReviewRecord, IntegrationReviewUpdate } from '../types';

export const integrationReviewApi = {
  get: (profileId: number) =>
    directGet<IntegrationReviewRecord>(`/api/profiles/${profileId}/integration-review`),
  update: (profileId: number, body: IntegrationReviewUpdate) =>
    put<IntegrationReviewRecord>(`/api/profiles/${profileId}/integration-review`, body),
};
