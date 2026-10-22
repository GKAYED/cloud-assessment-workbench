import type { CSSProperties } from 'react';
import type { Initiative } from '../types';
import { downloadWorkbook } from '../utils/excel';

const parseQuarter = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.trim();

  const patterns = [
    /^(\d{4})-Q([1-4])$/i,
    /^Q([1-4])\s*(?:-|\s)\s*(\d{4})$/i,
    /^(\d{4})\s*Q([1-4])$/i,
    /^Q([1-4])\s+(\d{4})$/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    let year, quarter;
    if (pattern === patterns[1] || pattern === patterns[3]) {
      quarter = Number(match[1]);
      year = Number(match[2]);
    } else {
      year = Number(match[1]);
      quarter = Number(match[2]);
    }
    if (quarter < 1 || quarter > 4) continue;
    return {
      raw: `${year}-Q${quarter}`,
      year,
      quarter,
      sortKey: year * 4 + (quarter - 1),
      label: `Q${quarter} ${year}`,
    };
  }

  return null;
};

type RoadmapItem = {
  item: Initiative;
  start: NonNullable<ReturnType<typeof parseQuarter>>;
  end: NonNullable<ReturnType<typeof parseQuarter>>;
};

export function InitiativesRoadmap({ items }: { items: Initiative[] }) {
  const timelineItems = items
    .map((item) => {
      const target = parseQuarter(item.target_quarter);
      const start = parseQuarter(item.planned_start_quarter) ?? target ?? parseQuarter(item.planned_end_quarter);
      const end = parseQuarter(item.planned_end_quarter) ?? target ?? start;
      return { item, start, end };
    })
    .filter((entry): entry is RoadmapItem => Boolean(entry.start && entry.end));

  const unscheduled = items.filter((item) => !timelineItems.some((entry) => entry.item.id === item.id));

  const allQuarterPoints = timelineItems.flatMap((entry) => [entry.start.sortKey, entry.end.sortKey]);
  const minQuarter = allQuarterPoints.length ? Math.min(...allQuarterPoints) : null;
  const maxQuarter = allQuarterPoints.length ? Math.max(...allQuarterPoints) : null;

  const quarterAxis = minQuarter != null && maxQuarter != null
    ? Array.from({ length: maxQuarter - minQuarter + 1 }, (_, offset) => {
        const sortKey = minQuarter + offset;
        const year = Math.floor(sortKey / 4);
        const quarter = (sortKey % 4) + 1;
        return {
          sortKey,
          raw: `${year}-Q${quarter}`,
          label: `Q${quarter} ${year}`,
        };
      })
    : [];

  const sortedTimelineItems = [...timelineItems].sort((a, b) => {
    if (a.start.sortKey !== b.start.sortKey) return a.start.sortKey - b.start.sortKey;
    return (b.item.prioritization_score ?? 0) - (a.item.prioritization_score ?? 0);
  });

  const laneNames = Array.from(new Set(items.map((item) => item.lane?.trim() || 'Unassigned')));
  const laneGroups = laneNames.map((lane) => ({
    lane,
    entries: sortedTimelineItems.filter(({ item }) => (item.lane?.trim() || 'Unassigned') === lane),
  }));

  const exportRoadmap = () => {
    const rows = items.map((item) => ({
      id: item.id,
      name: item.name,
      lane: item.lane || 'Unassigned',
      category: item.category || '',
      status: item.status || '',
      priority: item.priority || '',
      planned_start_quarter: item.planned_start_quarter || '',
      planned_end_quarter: item.planned_end_quarter || '',
      target_quarter: item.target_quarter || '',
      business_owner: item.business_owner || '',
      technical_owner: item.technical_owner || '',
    }));
    downloadWorkbook('Initiatives Roadmap', [{ name: 'Roadmap', rows }]);
  };

  return (
    <div className="roadmap-view roadmap-view--timeline">
      <div className="roadmap-timeline-intro">
        <div>
          <h3>Quarterly roadmap</h3>
          <p>A simple delivery timeline using planned start, planned end, and target quarter to show expected initiative sequencing.</p>
        </div>
        <div className="roadmap-timeline-actions">
          <button className="btn btn-secondary" type="button" onClick={exportRoadmap}>Export roadmap</button>
        </div>
        <div className="roadmap-timeline-legend">
          <span className="roadmap-timeline-legend__item roadmap-timeline-legend__item--critical">Critical</span>
          <span className="roadmap-timeline-legend__item roadmap-timeline-legend__item--high">High</span>
          <span className="roadmap-timeline-legend__item roadmap-timeline-legend__item--medium">Medium</span>
          <span className="roadmap-timeline-legend__item roadmap-timeline-legend__item--low">Low</span>
        </div>
      </div>

      {quarterAxis.length > 0 && (
        <div className="roadmap-chart" style={{ '--roadmap-quarter-count': quarterAxis.length } as CSSProperties}>
          <div className="roadmap-chart-header">
            <div className="roadmap-chart-header-label">Initiative</div>
            {quarterAxis.map((quarter) => (
              <div key={quarter.raw} className="roadmap-chart-header-quarter">
                {quarter.label}
              </div>
            ))}
          </div>

          {laneGroups.map((group) => (
            <div key={`lane-${group.lane}`} className="roadmap-chart-lane-group">
              <div className="roadmap-chart-lane-title">{group.lane}</div>
              {group.entries.map(({ item, start, end }) => {
                const totalQuarters = (maxQuarter || 0) - (minQuarter || 0) + 1;
                const left = ((start.sortKey - (minQuarter || 0)) / totalQuarters) * 100;
                const width = ((end.sortKey - start.sortKey + 1) / totalQuarters) * 100;
                return (
                  <div key={item.id} className="roadmap-chart-row">
                    <div className="roadmap-chart-row-label">{item.name}</div>
                    <div className="roadmap-chart-row-track">
                      <div
                        className={`roadmap-chart-bar roadmap-chart-bar--${item.priority.toLowerCase()}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span>{item.name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="roadmap-unscheduled">
          <h4>Unscheduled initiatives</h4>
          <div className="roadmap-unscheduled__list">
            {unscheduled.map((item) => (
              <div key={item.id} className="roadmap-unscheduled__item">
                <strong>{item.name}</strong>
                <span>{item.category}</span>
                <span>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
