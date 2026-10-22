import { SidePanel } from '../shared/SidePanel';
import type { DynamicsManualContextUpdate } from '../../types';

interface DynamicsManualContextPanelProps {
  open: boolean;
  form: DynamicsManualContextUpdate;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: <K extends keyof DynamicsManualContextUpdate>(field: K, value: DynamicsManualContextUpdate[K]) => void;
}

export function DynamicsManualContextPanel({
  open,
  form,
  saving,
  onClose,
  onSave,
  onFieldChange,
}: DynamicsManualContextPanelProps) {
  return (
    <SidePanel open={open} title="Edit Dynamics Manual Context" onClose={onClose}>
      <div className="crud-form-grid">
        <label className="span-full">
          Additional environments not returned by APIs
          <textarea
            rows={4}
            value={form.extra_environments ?? ''}
            onChange={(e) => onFieldChange('extra_environments', e.target.value)}
            placeholder="List any known Dynamics / Dataverse environments that were not discoverable, with purpose or owner if known."
          />
        </label>
        <label className="span-full">
          Dataverse capacity notes
          <textarea
            rows={4}
            value={form.dataverse_capacity_notes ?? ''}
            onChange={(e) => onFieldChange('dataverse_capacity_notes', e.target.value)}
            placeholder="Capture allocated and used Dataverse database / file / log space that could not be returned via APIs."
          />
        </label>
        <label className="span-full">
          Dataverse license notes
          <textarea
            rows={4}
            value={form.dataverse_license_notes ?? ''}
            onChange={(e) => onFieldChange('dataverse_license_notes', e.target.value)}
            placeholder="Document license context, limitations, or notable license metrics relevant to the Dynamics estate."
          />
        </label>
        <label className="span-full">
          Dataverse cost notes
          <textarea
            rows={4}
            value={form.dataverse_cost_notes ?? ''}
            onChange={(e) => onFieldChange('dataverse_cost_notes', e.target.value)}
            placeholder="Capture cost metrics or Dataverse spend figures that are known manually but not available in the current snapshot."
          />
        </label>
        <label className="span-full">
          Discovery and permission gap notes
          <textarea
            rows={4}
            value={form.discovery_gap_notes ?? ''}
            onChange={(e) => onFieldChange('discovery_gap_notes', e.target.value)}
            placeholder="Note anything the page could not report on because of API coverage, access, or permission limitations."
          />
        </label>
        <label className="span-full">
          Additional manual context
          <textarea
            rows={4}
            value={form.additional_notes ?? ''}
            onChange={(e) => onFieldChange('additional_notes', e.target.value)}
            placeholder="Add any other business or platform context that should sit beside the discovered footprint."
          />
        </label>
      </div>

      <div className="crud-form-actions">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Manual Context'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </SidePanel>
  );
}
