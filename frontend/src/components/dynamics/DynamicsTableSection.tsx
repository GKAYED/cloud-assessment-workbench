import { DataTable } from '../shared/DataTable';
import type { ModuleState } from '../../types';

interface DynamicsTableSectionProps<T extends object> {
  title: string;
  hook: ModuleState<T[]>;
  columns: Parameters<typeof DataTable<T>>[0]['columns'];
  emptyMessage: string;
}

export function DynamicsTableSection<T extends object>({
  title,
  hook,
  columns,
  emptyMessage,
}: DynamicsTableSectionProps<T>) {
  const rowCount = Array.isArray(hook.data) ? hook.data.length : 0;

  return (
    <>
      <h3>
        {title} <span className="summary-note">({rowCount})</span>
      </h3>
      {hook.status === 'success' && hook.data ? (
        hook.data.length > 0 ? (
          <DataTable data={hook.data} columns={columns} exportFileName={title} />
        ) : (
          <p className="empty-state">{emptyMessage}</p>
        )
      ) : hook.status === 'error' ? (
        <p className="error-text">
          {`Failed to load ${title.toLowerCase()}${hook.error ? `: ${hook.error}` : ''}`}
        </p>
      ) : (
        <p className="loading-text">Loading {title.toLowerCase()}…</p>
      )}
    </>
  );
}
