import type { ReactElement } from 'react';
import type { Phase2Opportunity } from '../../../api/framework';
import { renderReferenceList } from '../../../reporting/frameworkReferenceLinks';

export function FrameworkFuturePhaseOpportunities({
  opportunities,
}: {
  opportunities: Phase2Opportunity[];
}): ReactElement | null {
  if (opportunities.length === 0) return null;

  return (
    <>
      <h3 className="rpt-sub-heading">12.4 Future-phase opportunities</h3>
      <p className="rpt-desc">These items have been identified as candidates for deeper assessment in a future phase.</p>
      <table className="rpt-table rpt-table--future-phase">
        <thead><tr><th>Title</th><th>Description</th><th>Pillar</th><th>Reference</th></tr></thead>
        <tbody>
          {opportunities.map((opp, index) => (
            <tr key={`${opp.title}-${index}`}>
              <td><strong>{opp.title}</strong></td>
              <td>{opp.description}</td>
              <td>{opp.pillar ?? '—'}</td>
              <td>{renderReferenceList(opp.ref)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
