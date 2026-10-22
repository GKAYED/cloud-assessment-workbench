import { describe, expect, it } from 'vitest';
import { anonymousCafMethodologyFixture } from '../__fixtures__/anonymousProfileFixture';
import { deriveManualMethodology, ratingLabel } from '../cafMaturityShaping';

describe('CAF maturity shaping regression', () => {
  it('uses manual ratings over engine maturity when assessor overrides exist', () => {
    const manual = deriveManualMethodology(anonymousCafMethodologyFixture, {
      Policy: 'red',
      Tagging: 'amber',
      Ownership: 'amber',
    });

    expect(anonymousCafMethodologyFixture.maturity).toBe(5);
    expect(manual).toEqual({
      level: 2,
      label: 'Developing',
      ratedCount: 3,
      totalCount: 3,
    });
  });

  it('returns no manual assessment when the profile has no manual ratings', () => {
    expect(deriveManualMethodology(anonymousCafMethodologyFixture, undefined)).toBeNull();
    expect(deriveManualMethodology(anonymousCafMethodologyFixture, {})).toBeNull();
  });

  it('keeps manual rating labels stable for report copy', () => {
    expect(ratingLabel('red')).toBe('Initial');
    expect(ratingLabel('amber')).toBe('Developing');
    expect(ratingLabel('green')).toBe('Defined');
    expect(ratingLabel('unexpected')).toBe('Unknown');
  });

  it('ignores unknown manual rating values instead of coercing them', () => {
    const unsafeRatings = {
      Policy: 'green',
      Tagging: 'unknown',
      Ownership: 'amber',
    };

    const manual = deriveManualMethodology(
      anonymousCafMethodologyFixture,
      unsafeRatings,
    );

    expect(manual).toEqual({
      level: 3,
      label: 'Defined',
      ratedCount: 2,
      totalCount: 3,
    });
  });
});
