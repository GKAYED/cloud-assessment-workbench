interface CoverageSignal {
  label: string;
  value: string | number;
  status: string;
  note: string;
}

interface DynamicsCoverageSignalGridProps {
  signals: CoverageSignal[];
}

export function DynamicsCoverageSignalGrid({ signals }: DynamicsCoverageSignalGridProps) {
  return (
    <div className="dashboard-grid" style={{ marginBottom: 24 }}>
      {signals.map((item) => (
        <div key={item.label} className={`dashboard-card dynamics-signal-card dynamics-signal-card--${item.status}`}>
          <span className="dynamics-signal-card__label">{item.label}</span>
          <span className="dynamics-signal-card__value">{item.value}</span>
          <span className="dynamics-signal-card__note">{item.note}</span>
        </div>
      ))}
    </div>
  );
}
