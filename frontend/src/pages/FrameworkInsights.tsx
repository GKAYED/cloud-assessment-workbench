/**
 * FrameworkInsights - WAF / CAF alignment dashboard.
 *
 * Presents scored framework posture, supporting evidence,
 * and prioritized actions based on live assessment telemetry.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useModuleData } from '../hooks/useModuleData';
import { frameworkApi } from '../api/framework';
import type {
  FrameworkInsightsResponse,
  WafPillar,
  CafMethodology,
  Phase2Opportunity,
  FrameworkPriorityAction,
  FrameworkDataGap,
  MethodologyManualRatings,
  ManualFrameworkRating,
} from '../api/framework';
import { PageLayout } from '../components/layout/PageLayout';
import { LoadingIndicator } from '../components/layout/LoadingIndicator';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { useProfile } from '../hooks/useProfile';
import { getEnrichedCafSignals } from '../utils/cafSignals';
import { deriveManualMethodology, ratingLabel } from '../reporting/cafMaturityShaping';
import { getReferenceDocUrl } from '../reporting/frameworkReferenceLinks';
import './FrameworkInsights.css';

const PILLAR_COLOURS: Record<string, string> = {
  RE: '#60a5fa',
  SE: '#f87171',
  CO: '#34d399',
  OE: '#c084fc',
  PE: '#fbbf24',
};

const CAF_METHOD_COLOURS: Record<string, string> = {
  strategy: '#60a5fa',
  plan: '#f59e0b',
  ready: '#34d399',
  adopt: '#fbbf24',
  govern: '#f87171',
  secure: '#fb7185',
  manage: '#a78bfa',
};

const CAF_EVIDENCE_HINTS: Record<string, string> = {
  strategy: 'Capture application portfolio and strategic fit scoring.',
  plan: 'Define initiatives with target quarter and ownership.',
  ready: 'Collect landing zone and tagging evidence from inventory.',
  adopt: 'Pull Dynamics and license utilization telemetry.',
  govern: 'Pull policy, tagging, and governance control evidence.',
  secure: 'Pull Defender secure score and security recommendations.',
  manage: 'Pull integration and operations health telemetry.',
};

function scoreColour(score: number): string {
  if (score >= 80) return 'var(--color-success, #34d399)';
  if (score >= 60) return 'var(--color-warning, #fbbf24)';
  return 'var(--color-danger, #f87171)';
}

function maturityColour(level: number): string {
  if (level >= 4) return 'var(--color-success, #34d399)';
  if (level >= 3) return 'var(--color-info, #60a5fa)';
  if (level >= 2) return 'var(--color-warning, #fbbf24)';
  return 'var(--color-danger, #f87171)';
}

function severityRank(value: string | undefined): number {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'critical') return 4;
  if (normalized === 'high') return 3;
  if (normalized === 'medium') return 2;
  if (normalized === 'low') return 1;
  return 0;
}

function formatWholePercent(value: number | string | undefined | null): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0%';
  return `${Math.round(numeric)}%`;
}

function normalizePercentText(text: string): string {
  const normalizedPercents = text.replace(/(-?\d+(?:\.\d+)?)%/g, (_match, raw) => {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : `${raw}%`;
  });

  return normalizedPercents
    .replace(/\s[—–]\s/g, '. ')
    .replace(/(^|[.]\s+)([a-z])/g, (_match, prefix, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function formatDimensionScore(value: number | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'No direct metric';
  return `${Math.round(numeric)}% evidence score`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const FRAMEWORK_SCOPE_LABEL = 'Executive posture view based on current assessment evidence';

function normalizeScopeLabel(scope: string | null | undefined): string {
  const raw = String(scope ?? '').trim();
  if (!raw) return FRAMEWORK_SCOPE_LABEL;

  const withoutPrefix = raw
    .replace(/^phase\s*1\s*[—-]\s*/i, '')
    .replace(/^phase\s*1\s*:\s*/i, '');

  const canonical = withoutPrefix
    .replace(/discovery\s+and\s+assessment/i, 'Executive posture view')
    .replace(/high-level/gi, 'current assessment')
    .replace(/\s+/g, ' ')
    .trim();

  if (/discovery/i.test(canonical) && /assessment/i.test(canonical)) {
    return FRAMEWORK_SCOPE_LABEL;
  }

  return canonical;
}

function deriveManualNextActions(
  methodology: CafMethodology,
  ratingsForMethod: Record<string, ManualFrameworkRating> | undefined,
): Array<{ title: string; detail: string }> {
  const dims = methodology.sub_dimensions ?? [];
  if (!ratingsForMethod) return [];

  return dims
    .map((dim) => ({ dim, rating: ratingsForMethod[dim.name] }))
    .filter((entry): entry is { dim: NonNullable<CafMethodology['sub_dimensions']>[number]; rating: ManualFrameworkRating } =>
      entry.rating === 'red' || entry.rating === 'amber' || entry.rating === 'green')
    .filter((entry) => entry.rating !== 'green')
    .map((entry) => ({
      title: `${entry.rating === 'red' ? 'Establish' : 'Lift'} ${entry.dim.name}`,
      detail:
        entry.rating === 'red'
          ? `Current manual rating is ${ratingLabel(entry.rating)}. Set a minimum baseline for this sub-dimension.`
          : `Current manual rating is ${ratingLabel(entry.rating)}. Progress this sub-dimension toward Defined.`,
    }));
}

function renderReferenceText(text: string | null | undefined): ReactNode {
  const source = String(text ?? '').trim();
  if (!source) return 'N/A';

  const matcher = /([A-Z]{2}:\d{2})/g;
  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source)) !== null) {
    const refCode = match[1];
    if (match.index > lastIdx) {
      nodes.push(source.slice(lastIdx, match.index));
    }
    const href = getReferenceDocUrl(refCode);
    if (href) {
      nodes.push(
        <a
          key={`ref-${refCode}-${index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="fi-ref-link"
          title={`Open guidance for ${refCode}`}
        >
          {refCode}
        </a>
      );
    } else {
      nodes.push(refCode);
    }
    lastIdx = matcher.lastIndex;
    index += 1;
  }

  if (lastIdx < source.length) {
    nodes.push(source.slice(lastIdx));
  }

  return nodes.length > 0 ? <>{nodes}</> : source;
}

function WafRadar({ pillars, dataGaps }: { pillars: Record<string, WafPillar>; dataGaps: FrameworkDataGap[] }) {
  const pillarList = Object.values(pillars);
  const scoredCount = pillarList.filter((p) => p.has_data).length;

  if (scoredCount === 0) {
    const topGaps = [...dataGaps]
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 3);

    return (
      <div className="fi-radar-card">
        <h3>WAF Pillar Scores</h3>
        <p className="fi-no-data">
          No pillar has enough telemetry to calculate a defensible score yet.
        </p>
        {topGaps.length > 0 && (
          <ul className="fi-gap-list">
            {topGaps.map((gap, idx) => (
              <li key={idx}>
                <strong>{gap.module || 'Module'}:</strong> {gap.reason || 'Data not returned.'}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const data = pillarList.map((p) => ({
    code: p.code,
    name: p.name,
    score: p.has_data ? p.score : 0,
    hasData: p.has_data,
  }));

  return (
          <div className="fi-radar-card">
      <h3>WAF Pillar Scores</h3>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid stroke="var(--color-border, #2e3347)" />
          <PolarAngleAxis dataKey="code" tick={{ fontSize: 13, fontWeight: 700, fill: 'var(--color-text, #e4e6ed)' }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            axisLine={{ stroke: 'var(--color-border, #2e3347)' }}
            tick={{ fill: 'var(--color-text-secondary, #9498a8)', fontSize: 12, fontWeight: 600 }}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="var(--color-primary, #4f8ff7)"
            fill="var(--color-primary, #4f8ff7)"
            fillOpacity={0.28}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface, #1a1d27)',
              border: '1px solid var(--color-border, #2e3347)',
              borderRadius: 8,
            }}
            labelStyle={{ color: 'var(--color-text, #e4e6ed)' }}
            itemStyle={{ color: 'var(--color-text, #e4e6ed)' }}
            formatter={(value: number | string | undefined) => [formatWholePercent(value), 'Score']}
            labelFormatter={(label: unknown) => `Pillar ${String(label ?? '')}`}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="fi-radar-legend">
        {pillarList.map((pillar) => (
          <div key={pillar.code} className="fi-radar-legend-item">
            <span className="fi-radar-dot" style={{ background: PILLAR_COLOURS[pillar.code] ?? '#64748b' }} />
            <span className="fi-radar-name">{pillar.name}</span>
            <span className="fi-radar-value" style={{ color: pillar.has_data ? scoreColour(pillar.score) : 'var(--color-text-secondary)' }}>
              {pillar.has_data ? formatWholePercent(pillar.score) : 'Not scored'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CafRadar({
  methodologies,
  manualRatings,
}: {
  methodologies: Record<string, CafMethodology>;
  manualRatings: MethodologyManualRatings;
}) {
  const entries = Object.entries(methodologies).map(([key, methodology]) => {
    const manual = deriveManualMethodology(methodology, manualRatings[key] ?? {});
    const effectiveMaturity = manual?.level ?? methodology.maturity;
    return {
      key,
      label: methodology.name,
      maturity: effectiveMaturity,
      score: Math.round((effectiveMaturity / 5) * 100),
    };
  });

  return (
    <div className="fi-radar-card">
      <h3>CAF Methodology Maturity</h3>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={entries}>
          <PolarGrid stroke="var(--color-border, #2e3347)" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 13, fontWeight: 700, fill: 'var(--color-text, #e4e6ed)' }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            axisLine={{ stroke: 'var(--color-border, #2e3347)' }}
            tick={{ fill: 'var(--color-text-secondary, #9498a8)', fontSize: 12, fontWeight: 600 }}
            tickFormatter={(value: number | string) => `${Math.round(Number(value) / 20)}/5`}
          />
          <Radar
            name="Maturity"
            dataKey="score"
            stroke="var(--color-warning, #fbbf24)"
            fill="var(--color-warning, #fbbf24)"
            fillOpacity={0.24}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface, #1a1d27)',
              border: '1px solid var(--color-border, #2e3347)',
              borderRadius: 8,
            }}
            labelStyle={{ color: 'var(--color-text, #e4e6ed)' }}
            itemStyle={{ color: 'var(--color-text, #e4e6ed)' }}
            formatter={(_value: number | string | undefined, _name?: string, item?: { payload?: { maturity?: number } }) => {
              const payload = item?.payload as { maturity?: number } | undefined;
              return [`${payload?.maturity ?? 0}/5`, 'Maturity'];
            }}
            labelFormatter={(label: unknown) => `Methodology ${String(label ?? '')}`}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="fi-radar-legend">
        {entries.map((entry) => (
          <div key={entry.key} className="fi-radar-legend-item">
            <span className="fi-radar-dot" style={{ background: CAF_METHOD_COLOURS[entry.key] ?? '#64748b' }} />
            <span className="fi-radar-name">{entry.label}</span>
            <span className="fi-radar-value" style={{ color: maturityColour(entry.maturity) }}>
              {entry.maturity}/5
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PillarCard({ pillar }: { pillar: WafPillar }) {
  const [expanded, setExpanded] = useState(false);
  const colour = PILLAR_COLOURS[pillar.code] ?? '#64748b';

  return (
    <div className="fi-pillar-card" style={{ borderLeftColor: colour }}>
      <button type="button" className="fi-pillar-header" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
        <div className="fi-pillar-title">
          <span className="fi-pillar-code" style={{ background: colour }}>
            {pillar.code}
          </span>
          <span>{pillar.name}</span>
        </div>
        <div className="fi-pillar-score" style={{ color: pillar.has_data ? scoreColour(pillar.score) : 'var(--color-text-secondary)' }}>
          {pillar.has_data ? formatWholePercent(pillar.score) : 'No score'}
        </div>
        <span className="fi-pillar-toggle">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="fi-pillar-body">
          <p className="fi-pillar-desc">{pillar.description}</p>
          <p className="fi-pillar-ref">
            Checklist: {renderReferenceText(pillar.checklist_range)}
          </p>
          <p className="fi-pillar-doc">
            <a
              href={`https://learn.microsoft.com/azure/architecture/framework/${pillar.name.toLowerCase().replace(/\s+/g, '-')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more about {pillar.name}
            </a>
          </p>

          <div className="fi-section">
            <h4>Findings</h4>
            {pillar.findings.length > 0 ? (
              <ul className="fi-findings-list">
                {pillar.findings.map((f, i) => (
                  <li key={i}>
                    <span className="fi-finding-source">
                      {f.source}
                      {f.subscription_name || f.subscription_id ? ` · ${f.subscription_name ?? f.subscription_id}` : ''}
                    </span>
                    <span className="fi-finding-detail">{normalizePercentText(f.detail)}</span>
                    {f.checklist_ref && <span className="fi-finding-ref">{renderReferenceText(f.checklist_ref)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fi-no-data">
                {pillar.has_data
                  ? 'No notable risks were detected for this pillar in current telemetry.'
                  : 'No telemetry mapped to this pillar yet. Complete a fresh pull or resolve data gaps below.'}
              </p>
            )}
          </div>

          <div className="fi-section">
            <h4>Recommended Next Steps</h4>
            {pillar.phase2_opportunities.length > 0 ? (
              <ul className="fi-phase2-list">
                {pillar.phase2_opportunities.slice(0, 3).map((o, i) => (
                  <li key={i}>
                    <strong>{o.title}</strong>
                    <p>{o.description}</p>
                    <span className="fi-phase2-ref">{renderReferenceText(o.ref)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fi-no-data">No targeted actions were generated for this pillar.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CafOverview({
  methodologies,
  manualRatings,
  onToggleRating,
  canToggleRatings,
  engineAverage,
}: {
  methodologies: Record<string, CafMethodology>;
  manualRatings: MethodologyManualRatings;
  onToggleRating: (methodKey: string, dimName: string, rating: ManualFrameworkRating) => void;
  canToggleRatings: boolean;
  engineAverage: number;
}) {
  const methodologyEntries = Object.entries(methodologies);
  const manualSnapshots = methodologyEntries.map(([key, methodology]) => {
    const ratingsForMethod = manualRatings[key] ?? {};
    return {
      key,
      methodology,
      manualAssessment: deriveManualMethodology(methodology, ratingsForMethod),
      ratingsForMethod,
    };
  });
  const manualAverage = average(
    manualSnapshots
      .map((entry) => entry.manualAssessment?.level ?? null)
      .filter((value): value is number => typeof value === 'number'),
  );
  const manualRatedCount = manualSnapshots.reduce((sum, entry) => sum + (entry.manualAssessment?.ratedCount ?? 0), 0);
  const manualTotalCount = manualSnapshots.reduce((sum, entry) => sum + (entry.methodology.sub_dimensions?.length ?? 0), 0);
  const manualCoverage = manualTotalCount > 0 ? (manualRatedCount / manualTotalCount) * 100 : 0;

  return (
    <div className="fi-caf-section">
      <h3>Cloud Adoption Framework maturity assessment</h3>
      <p className="fi-caf-subtitle">
        The score tiles below separate the backend engine score from the live manual assessment overlay.
        Manual Red / Amber / Green ratings can override the engine-derived maturity for each methodology as more evidence is reviewed.
      </p>

      <div className="fi-caf-score-grid">
        <article className="fi-caf-score-card fi-caf-score-card--engine">
          <div className="fi-caf-score-card__ring" style={{ ['--fi-caf-score-fill' as string]: `${Math.max(0, Math.min(100, (engineAverage ?? 0) / 5 * 100))}%` }}>
            <span className="fi-caf-score-card__value" style={{ color: engineAverage !== null ? maturityColour(Math.round(engineAverage)) : 'var(--color-text-secondary)' }}>
              {engineAverage !== null ? `${engineAverage.toFixed(1)}/5` : 'N/A'}
            </span>
          </div>
          <div className="fi-caf-score-card__body">
            <span className="fi-caf-score-card__label">Engine CAF score</span>
            <strong className="fi-caf-score-card__headline">Backend-derived maturity</strong>
            <p className="fi-caf-score-card__text">Average of the methodologies with live telemetry and portfolio evidence.</p>
            <span className="fi-caf-score-card__meta">{methodologyEntries.length} methodologies in scope</span>
          </div>
        </article>

        <article className="fi-caf-score-card fi-caf-score-card--manual">
          <div className="fi-caf-score-card__ring" style={{ ['--fi-caf-score-fill' as string]: `${Math.max(0, Math.min(100, manualCoverage))}%` }}>
            <span className="fi-caf-score-card__value" style={{ color: manualAverage !== null ? maturityColour(Math.round(manualAverage)) : 'var(--color-text-secondary)' }}>
              {manualAverage !== null ? `${manualAverage.toFixed(1)}/5` : 'N/A'}
            </span>
          </div>
          <div className="fi-caf-score-card__body">
            <span className="fi-caf-score-card__label">Manual assessment</span>
            <strong className="fi-caf-score-card__headline">User-driven overlay</strong>
            <p className="fi-caf-score-card__text">Updates as sub-dimensions are rated and overrides the engine where manual evidence is stronger.</p>
            <span className="fi-caf-score-card__meta">{manualRatedCount}/{manualTotalCount || 0} sub-dimensions rated</span>
          </div>
        </article>
      </div>

      <div className="fi-caf-grid">
        {methodologyEntries.map(([key, m]) => {
          const ratingsForMethod = manualRatings[key] ?? {};
          const manualAssessment = deriveManualMethodology(m, ratingsForMethod);
          const displayMaturity = manualAssessment?.level ?? m.maturity;
          const displayLabel = manualAssessment?.label ?? m.maturity_label;
          const displaySignals = getEnrichedCafSignals(key, m);
          const displayActions = manualAssessment
            ? deriveManualNextActions(m, ratingsForMethod)
            : (m.next_level_actions ?? []).map((action) => ({
                title: action.action,
                detail: `${action.current_value} -> ${action.target_value}`,
              }));

          return (
            <div key={key} className="fi-caf-card">
              <div className="fi-caf-name">{m.name}</div>
              <div className="fi-caf-maturity" style={{ color: maturityColour(displayMaturity) }}>
                {displayLabel}
                <span className="fi-caf-level"> ({displayMaturity}/5)</span>
              </div>
              {manualAssessment && (
                <div className="fi-caf-manual-banner">
                  Manual overlay active: {manualAssessment.ratedCount}/{manualAssessment.totalCount} sub-dimensions rated.
                </div>
              )}
              <p className="fi-caf-desc">{m.description}</p>
              <p className="fi-caf-doc">
                <a
                  href={`https://learn.microsoft.com/azure/cloud-adoption-framework/${key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read more about {m.name}
                </a>
              </p>
              {displaySignals.length > 0 ? (
                <ul className="fi-caf-signals">
                  {displaySignals.map((s, i) => (
                    <li key={i}>{normalizePercentText(s)}</li>
                  ))}
                </ul>
              ) : (
                <p className="fi-no-data">No measurable signals yet. {CAF_EVIDENCE_HINTS[key] ?? 'Collect additional evidence for this methodology.'}</p>
              )}
              {m.sub_dimensions && m.sub_dimensions.length > 0 && (
                <div className="fi-caf-subdims">
                  <h4>Evidence breakdown</h4>
                  <div className="fi-caf-subdim-list">
                    {m.sub_dimensions.map((dim, idx) => (
                      <div
                        key={`${key}-${dim.name}-${idx}`}
                        className={`fi-caf-subdim fi-caf-subdim--${(ratingsForMethod[dim.name] === 'red'
                          ? 'poor'
                          : ratingsForMethod[dim.name] === 'amber'
                            ? 'warning'
                            : ratingsForMethod[dim.name] === 'green'
                              ? 'good'
                              : dim.status) || 'no-data'}`}
                      >
                        <div className="fi-caf-subdim-head">
                          <span className="fi-caf-subdim-name">{dim.name}</span>
                          <span className="fi-caf-subdim-score">{formatDimensionScore(dim.score)}</span>
                        </div>
                        <div className="fi-caf-rating-controls">
                          {(['red', 'amber', 'green'] as const).map((rating) => (
                            <button
                              key={`${key}-${dim.name}-${rating}`}
                              type="button"
                              className={`fi-caf-rating fi-caf-rating--${rating} ${ratingsForMethod[dim.name] === rating ? 'is-active' : ''}`}
                              onClick={() => onToggleRating(key, dim.name, rating)}
                              title={canToggleRatings ? `Manual rating: ${ratingLabel(rating)}` : 'Manual ratings are unavailable while CAF assessment is loading.'}
                              disabled={!canToggleRatings}
                            >
                              {ratingLabel(rating)}
                            </button>
                          ))}
                        </div>
                        {ratingsForMethod[dim.name] && (
                          <p className="fi-caf-manual-note">
                            Manual assessment: {ratingLabel(ratingsForMethod[dim.name])}.
                          </p>
                        )}
                        {dim.signals.length > 0 ? (
                          <ul className="fi-caf-subdim-signals">
                            {dim.signals.slice(0, 3).map((signal, signalIdx) => (
                              <li key={`${key}-${dim.name}-signal-${signalIdx}`}>{normalizePercentText(signal)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="fi-no-data">No direct evidence for this sub-dimension yet.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {displayActions.length > 0 && (
                <div className="fi-caf-next">
                  <h4>Next level actions</h4>
                  <ul className="fi-caf-next-list">
                    {displayActions.slice(0, 3).map((action, idx) => (
                      <li key={`${key}-next-${idx}`}>
                        <strong>{action.title}</strong>
                        <span>{action.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriorityActions({ actions }: { actions: FrameworkPriorityAction[] }) {
  return (
    <section className="fi-actions-section">
      <h3>Priority Actions</h3>
      {actions.length === 0 ? (
        <p className="fi-no-data">No priority actions generated from current data.</p>
      ) : (
        <div className="fi-actions-grid">
          {actions.map((action, idx) => (
            <article key={idx} className="fi-action-card">
              <div className="fi-action-header">
                <h4>{action.title}</h4>
                <span className={`fi-priority fi-priority-${String(action.priority || 'medium').toLowerCase()}`}>
                  {action.priority || 'medium'}
                </span>
              </div>
              <p className="fi-action-rationale">{normalizePercentText(action.rationale)}</p>
              <p className="fi-action-next"><strong>Next step:</strong> {action.recommended_action}</p>
              <p className="fi-action-ref">Reference: {renderReferenceText(action.reference)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Phase2Summary({ items }: { items: Phase2Opportunity[] }) {
  const grouped: Record<string, Phase2Opportunity[]> = {};
  items.forEach((item) => {
    const key = item.pillar ?? 'General';
    (grouped[key] ??= []).push(item);
  });

  return (
    <div className="fi-phase2-section">
      <h3>Future Phases - Deep Dive Opportunities</h3>
      <p className="fi-phase2-intro">
        These assessments are outside discovery and assessment scope and should be planned as dedicated follow-on work.
      </p>
      {items.length === 0 ? (
        <p className="fi-no-data">No Phase 2 opportunities were identified from current data.</p>
      ) : (
        Object.entries(grouped).map(([pillar, opps]) => (
          <div key={pillar} className="fi-phase2-group">
            <h4>{pillar}</h4>
            <div className="fi-phase2-cards">
              {opps.map((o, i) => (
                <div key={i} className="fi-phase2-card">
                  <div className="fi-phase2-card-title">{o.title}</div>
                  <p>{o.description}</p>
                  <span className="fi-phase2-ref">{renderReferenceText(o.ref)}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function FrameworkInsights() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const { status, data, error } = useModuleData<FrameworkInsightsResponse>(
    () => frameworkApi.insights(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.frameworkInsights },
  );
  const [manualRatingsState, setManualRatingsState] = useState<{
    profileId: number | null;
    ratings: MethodologyManualRatings;
  }>({ profileId: null, ratings: {} });
  const [manualRatingsLoading, setManualRatingsLoading] = useState(false);
  const [manualRatingsErrorState, setManualRatingsErrorState] = useState<{
    profileId: number | null;
    error: string | null;
  }>({ profileId: null, error: null });
  const manualRatingsLoadRequestSeqRef = useRef(0);
  const manualRatingsSaveRequestSeqRef = useRef(0);
  const manualRatingsProfileEpochRef = useRef(0);
  const manualRatings = manualRatingsState.profileId === profileId ? manualRatingsState.ratings : {};
  const visibleManualRatingsLoading = profileId ? manualRatingsLoading : false;
  const visibleManualRatingsError = manualRatingsErrorState.profileId === profileId ? manualRatingsErrorState.error : null;
  const canToggleManualRatings = Boolean(profileId) && !manualRatingsLoading && manualRatingsState.profileId === profileId;

  useEffect(() => {
    manualRatingsProfileEpochRef.current += 1;
    const loadRequestSeq = ++manualRatingsLoadRequestSeqRef.current;

    if (!profileId) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || manualRatingsLoadRequestSeqRef.current !== loadRequestSeq) return;
      setManualRatingsState({ profileId, ratings: {} });
      setManualRatingsErrorState({ profileId, error: null });
      setManualRatingsLoading(true);
    });

    void frameworkApi.getManualCaf(profileId)
      .then((record) => {
        if (cancelled || manualRatingsLoadRequestSeqRef.current !== loadRequestSeq) return;
        setManualRatingsState({ profileId, ratings: record.ratings ?? {} });
        setManualRatingsErrorState({ profileId, error: null });
      })
      .catch((err) => {
        if (cancelled || manualRatingsLoadRequestSeqRef.current !== loadRequestSeq) return;
        setManualRatingsErrorState({
          profileId,
          error: err instanceof Error ? err.message : 'Failed to load CAF manual assessment.',
        });
      })
      .finally(() => {
        if (!cancelled && manualRatingsLoadRequestSeqRef.current === loadRequestSeq) {
          setManualRatingsLoading(false);
        }
      });

    return () => {
      manualRatingsProfileEpochRef.current += 1;
      cancelled = true;
      manualRatingsSaveRequestSeqRef.current += 1;
    };
  }, [profileId]);

  const toggleManualRating = useCallback((methodKey: string, dimName: string, rating: ManualFrameworkRating) => {
    if (!profileId || manualRatingsLoading || manualRatingsState.profileId !== profileId) return;
    setManualRatingsState((currentState) => {
      const current = currentState.profileId === profileId ? currentState.ratings : {};
      const existingMethodRatings = { ...(current[methodKey] ?? {}) };
      if (existingMethodRatings[dimName] === rating) {
        delete existingMethodRatings[dimName];
      } else {
        existingMethodRatings[dimName] = rating;
      }
      const next: MethodologyManualRatings = {
        ...current,
        [methodKey]: existingMethodRatings,
      };
      if (Object.keys(next[methodKey]).length === 0) {
        delete next[methodKey];
      }
      setManualRatingsErrorState({ profileId, error: null });
      const saveRequestSeq = ++manualRatingsSaveRequestSeqRef.current;
      const profileEpoch = manualRatingsProfileEpochRef.current;
      void frameworkApi.updateManualCaf(profileId, { ratings: next })
        .catch((err) => {
          if (
            manualRatingsSaveRequestSeqRef.current !== saveRequestSeq
            || manualRatingsProfileEpochRef.current !== profileEpoch
          ) return;
          setManualRatingsErrorState({
            profileId,
            error: err instanceof Error ? err.message : 'Failed to save CAF manual assessment.',
          });
        });
      return { profileId, ratings: next };
    });
  }, [manualRatingsLoading, manualRatingsState.profileId, profileId]);

  if (status === 'loading' || status === 'pending') return <LoadingIndicator />;

  if (status === 'error') {
    return (
      <PageLayout title="Customer Assessments" exportId="framework-insights-page">
        <div className="fi-error">
          <p>Failed to load customer assessments view: {error}</p>
        </div>
      </PageLayout>
    );
  }

  if (!data) return null;

  const pillarList = Object.values(data.waf_pillars);
  const scoredPillars = pillarList.filter((p) => p.has_data);
  const sortedScored = [...scoredPillars].sort((a, b) => a.score - b.score);
  const lowest = sortedScored.slice(0, 2).map((p) => p.name);
  const highest = sortedScored.slice(-2).map((p) => p.name);
  const scopeLabel = normalizeScopeLabel(data.assessment_scope);
  const effectiveMethodologies = Object.entries(data.caf_methodologies).map(([key, methodology]) => {
    const manual = deriveManualMethodology(methodology, manualRatings[key] ?? {});
    return {
      key,
      methodology,
      displaySignals: getEnrichedCafSignals(key, methodology),
      effectiveMaturity: manual?.level ?? methodology.maturity,
      effectiveLabel: manual?.label ?? methodology.maturity_label,
      hasManual: Boolean(manual),
    };
  });
  const effectiveAverageMaturity = effectiveMethodologies.length > 0
    ? effectiveMethodologies.reduce((sum, item) => sum + item.effectiveMaturity, 0) / effectiveMethodologies.length
    : 0;
  const sortedMethodologies = [...effectiveMethodologies].sort((a, b) => a.effectiveMaturity - b.effectiveMaturity);
  const weakestMethodologies = sortedMethodologies.slice(0, 2).map((item) => item.methodology.name);
  const strongestMethodologies = [...sortedMethodologies].slice(-2).map((item) => item.methodology.name);
  const cafReviewedCount = effectiveMethodologies.length;

  return (
    <PageLayout title="Customer Assessments" exportId="framework-insights-page">
      <div className="fi-scope-banner">{scopeLabel}</div>

      <p className="fi-intro-text">
        Customer-facing WAF and CAF assessment based on evidence, manual review, and live Azure data for the active profile.
      </p>

      <section className="fi-intro-notes">
        <h3>How to read this view</h3>
        <ul className="fi-intro-list">
          <li>Framework scores are evidence-based assessments aligned to Microsoft documentation, not direct maturity results returned by Azure APIs.</li>
          <li>Some figures recur across CAF methodologies because the same factual metric can support more than one practice area.</li>
          <li>CAF assessment use manual Red / Amber / Green overrides for CAF evidence reviews.</li>
        </ul>
      </section>

      {visibleManualRatingsLoading && <LoadingIndicator compact message="Loading CAF manual assessment…" />}
      {visibleManualRatingsError && <p className="error-text">{visibleManualRatingsError}</p>}

      <div className="fi-summary-row">
        <div className="fi-summary-card">
          <div className="fi-summary-value" style={{ color: scoredPillars.length > 0 ? scoreColour(data.waf_overall_score) : 'var(--color-text-secondary)' }}>
            {scoredPillars.length > 0 ? formatWholePercent(data.waf_overall_score) : 'N/A'}
          </div>
          <div className="fi-summary-label">WAF Overall Score</div>
          <div className="fi-summary-sublabel">Average of pillars that have telemetry evidence</div>
        </div>
        <div className="fi-summary-card">
          <div className="fi-summary-value" style={{ color: effectiveAverageMaturity > 0 ? maturityColour(Math.round(effectiveAverageMaturity)) : 'var(--color-text-secondary)' }}>
            {effectiveAverageMaturity > 0 ? `${effectiveAverageMaturity.toFixed(1)}/5` : 'N/A'}
          </div>
          <div className="fi-summary-label">CAF Maturity</div>
          <div className="fi-summary-sublabel">Average of displayed methodology maturities, including manual overlays where present</div>
        </div>
        <div className="fi-summary-card">
          <div className="fi-summary-value">{data.phase2_count}</div>
          <div className="fi-summary-label">Future Phase Items</div>
          <div className="fi-summary-sublabel">Follow-on assessments outside discovery and assessment scope</div>
        </div>
      </div>

      <PriorityActions actions={data.priority_actions || []} />
      <div className="fi-radar-grid">
        <WafRadar pillars={data.waf_pillars} dataGaps={data.data_gaps || []} />
        <CafRadar methodologies={data.caf_methodologies} manualRatings={manualRatings} />
      </div>

      <section className="fi-framework-section">
        <h3>Well-Architected Framework posture</h3>
        <div className="fi-intro-highlights">
          <article className="fi-intro-card fi-intro-card--coverage">
            <span className="fi-intro-card__label">Coverage</span>
            <strong className="fi-intro-card__value">{data.scored_pillars_count} of {data.total_pillars}</strong>
            <p className="fi-intro-card__text">Pillars with enough evidence to support a score.</p>
          </article>
          <article className="fi-intro-card fi-intro-card--strength">
            <span className="fi-intro-card__label">Current strengths</span>
            <strong className="fi-intro-card__value">{highest.length > 0 ? highest.join(', ') : 'Not enough scored data yet'}</strong>
            <p className="fi-intro-card__text">Highest-scoring architecture areas from the current assessment.</p>
          </article>
          <article className="fi-intro-card fi-intro-card--focus">
            <span className="fi-intro-card__label">Improvement opportunities</span>
            <strong className="fi-intro-card__value">{lowest.length > 0 ? lowest.join(', ') : 'Resolve data gaps first'}</strong>
            <p className="fi-intro-card__text">Areas most likely to benefit from deeper review and action planning.</p>
          </article>
        </div>
      </section>

      <div className="fi-pillars-section">
        <h3>Pillar Details</h3>
        {pillarList.map((p) => (
          <PillarCard key={p.code} pillar={p} />
        ))}
      </div>

      <section className="fi-framework-section">
        <h3>Cloud Adoption Framework maturity</h3>
        <div className="fi-intro-highlights">
          <article className="fi-intro-card fi-intro-card--coverage">
            <span className="fi-intro-card__label">Coverage</span>
            <strong className="fi-intro-card__value">{cafReviewedCount} of {effectiveMethodologies.length}</strong>
            <p className="fi-intro-card__text">CAF methodologies reviewed through evidence and manual assessment.</p>
          </article>
          <article className="fi-intro-card fi-intro-card--strength">
            <span className="fi-intro-card__label">Current strengths</span>
            <strong className="fi-intro-card__value">{strongestMethodologies.length > 0 ? strongestMethodologies.join(', ') : 'Assessment not started yet'}</strong>
            <p className="fi-intro-card__text">Methodologies currently showing the strongest maturity signals.</p>
          </article>
          <article className="fi-intro-card fi-intro-card--focus">
            <span className="fi-intro-card__label">Improvement opportunities</span>
            <strong className="fi-intro-card__value">{weakestMethodologies.length > 0 ? weakestMethodologies.join(', ') : 'Assessment not started yet'}</strong>
            <p className="fi-intro-card__text">Methodologies most likely to benefit from further uplift and validation.</p>
          </article>
        </div>
      </section>

      <CafOverview
        methodologies={data.caf_methodologies}
        manualRatings={manualRatings}
        onToggleRating={toggleManualRating}
        canToggleRatings={canToggleManualRatings}
        engineAverage={data.caf_average_maturity}
      />
      <Phase2Summary items={data.phase2_summary} />

      <section className="fi-resources-section">
        <h3>Further reading</h3>
        <ul className="fi-resources-list">
          <li><a href="https://learn.microsoft.com/azure/architecture/framework/" target="_blank" rel="noopener noreferrer">Azure Well-Architected Framework overview</a></li>
          <li><a href="https://learn.microsoft.com/azure/cloud-adoption-framework/" target="_blank" rel="noopener noreferrer">Cloud Adoption Framework documentation</a></li>
          <li><a href="https://learn.microsoft.com/learn/paths/architecture-skills/" target="_blank" rel="noopener noreferrer">WAF training modules on Microsoft Learn</a></li>
          <li><a href="https://learn.microsoft.com/azure/architecture/framework/compare" target="_blank" rel="noopener noreferrer">Compare WAF pillars to CAF methodologies</a></li>
          <li><a href="https://learn.microsoft.com/azure/architecture/framework/reliability/" target="_blank" rel="noopener noreferrer">Legend: RE = Reliability</a></li>
          <li><a href="https://learn.microsoft.com/azure/architecture/framework/security/" target="_blank" rel="noopener noreferrer">Legend: SE = Security</a></li>
          <li><a href="https://learn.microsoft.com/azure/architecture/framework/cost-optimization/" target="_blank" rel="noopener noreferrer">Legend: CO = Cost Optimization</a></li>
          <li><a href="https://learn.microsoft.com/azure/architecture/framework/operational-excellence/" target="_blank" rel="noopener noreferrer">Legend: OE = Operational Excellence</a></li>
          <li><a href="https://learn.microsoft.com/azure/architecture/framework/performance-efficiency/" target="_blank" rel="noopener noreferrer">Legend: PE = Performance Efficiency</a></li>
        </ul>
      </section>
    </PageLayout>
  );
}

export default FrameworkInsights;
