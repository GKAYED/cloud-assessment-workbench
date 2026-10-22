import { describe, expect, it } from 'vitest';
import { completeReportRegressionFixture, partialReportRegressionFixture } from '../__fixtures__/reportRegressionFixtures';

describe('report regression fixtures', () => {
  it('keeps the complete profile fully populated for regression coverage', () => {
    expect(completeReportRegressionFixture.dataGaps).toEqual([]);
    expect(completeReportRegressionFixture.costBySubscription).toHaveLength(2);
    expect(completeReportRegressionFixture.manualCafRatings).toEqual({
      Policy: 'green',
      Tagging: 'amber',
      Ownership: 'amber',
    });
  });

  it('keeps the partial profile explicit about its missing evidence', () => {
    expect(partialReportRegressionFixture.dataGaps).toEqual([
      'No cost evidence was imported for the selected profile.',
      'No manual CAF ratings were captured for the selected profile.',
      'Only inventory evidence is present for the selected profile.',
    ]);
    expect(partialReportRegressionFixture.costByResource).toHaveLength(0);
    expect(partialReportRegressionFixture.manualCafRatings).toEqual({});
  });
});
