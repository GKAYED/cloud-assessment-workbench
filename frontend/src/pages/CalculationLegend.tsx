import { PageLayout } from '../components/layout/PageLayout';
import { calculationLegendSections } from '../utils/calculationLegend';

export default function CalculationLegend() {
  return (
    <PageLayout title="Legend & Calculations" exportId="calculation-legend-page">
      <section className="calc-legend-intro">
        <p>
          This page documents how the main calculated figures across the assessment are derived. It is intended as a
          reference for report review, screenshots, customer walkthroughs, and validation discussions.
        </p>
        <p className="section-note">
          Where a number is rule-based or inferred rather than directly returned by Azure or Microsoft Graph, that is
          called out explicitly in the notes below.
        </p>
        <p className="section-note">
          This is especially important for pages like Applications Discovery and the Assessment Report integration
          landscape/map sections, where the app uses Azure-visible evidence plus normalization, review context, and
          inference logic to produce a more readable technical view.
        </p>
      </section>

      <div className="calc-legend-list">
        {calculationLegendSections.map((section) => (
          <section key={section.page} className="calc-legend-card">
            <div className="calc-legend-card__header">
              <div>
                <h2>{section.page}</h2>
                <p>{section.summary}</p>
              </div>
              <a href={section.route} className="btn btn-secondary">
                Open page
              </a>
            </div>

            <div className="calc-legend-table-wrap">
              <table className="calc-legend-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>How It Is Calculated</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={`${section.page}-${row.metric}`}>
                      <td>{row.metric}</td>
                      <td>{row.formula}</td>
                      <td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </PageLayout>
  );
}
