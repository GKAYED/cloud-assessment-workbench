import type { CafMethodology, ManualFrameworkRating } from '../api/framework';

export type ManualMethodologyAssessment = {
  level: number;
  label: string;
  ratedCount: number;
  totalCount: number;
};

function isManualFrameworkRating(value: unknown): value is ManualFrameworkRating {
  return value === 'red' || value === 'amber' || value === 'green';
}

export function ratingLabel(rating: unknown): string {
  if (rating === 'green') return 'Defined';
  if (rating === 'amber') return 'Developing';
  if (rating === 'red') return 'Initial';
  return 'Unknown';
}

function ratingLevel(rating: ManualFrameworkRating): number {
  if (rating === 'green') return 3;
  if (rating === 'amber') return 2;
  if (rating === 'red') return 1;
  throw new Error(`Unknown manual framework rating: ${String(rating)}`);
}

export function deriveManualMethodology(
  methodology: CafMethodology,
  ratingsForMethod: Record<string, unknown> | undefined,
): ManualMethodologyAssessment | null {
  const dims = methodology.sub_dimensions ?? [];
  if (dims.length === 0 || !ratingsForMethod) return null;

  const rated = dims
    .map((dim) => ratingsForMethod[dim.name])
    .filter(isManualFrameworkRating);

  if (rated.length === 0) return null;

  const average = rated.reduce((sum, value) => sum + ratingLevel(value), 0) / rated.length;
  const level = average >= 2.5 ? 3 : average >= 1.5 ? 2 : 1;
  return {
    level,
    label: level === 3 ? 'Defined' : level === 2 ? 'Developing' : 'Initial',
    ratedCount: rated.length,
    totalCount: dims.length,
  };
}
