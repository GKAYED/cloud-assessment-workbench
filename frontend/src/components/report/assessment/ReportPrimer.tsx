import type { ReactElement } from 'react';
import type { ReportPrimerContent } from './reportPrimerContent';

export function ReportPrimer({ about, summary, howToRead }: ReportPrimerContent): ReactElement {
  return (
    <div className="rpt-context-grid">
      <div className="rpt-context-card">
        <h3 className="rpt-sub-heading">About this document</h3>
        <p>{about}</p>
      </div>
      <div className="rpt-context-card">
        <h3 className="rpt-sub-heading">Executive summary</h3>
        <p>{summary}</p>
      </div>
      <div className="rpt-context-card">
        <h3 className="rpt-sub-heading">How to read this document</h3>
        <p>{howToRead}</p>
      </div>
    </div>
  );
}
