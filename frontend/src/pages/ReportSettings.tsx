import { useEffect, useMemo, useRef, useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { ReportDeliveryExports } from '../components/report/ReportDeliveryExports';
import { reportSettingsApi } from '../api/reportSettings';
import { useProfile } from '../hooks/useProfile';
import {
  REPORT_SETTINGS_CHANGED_EVENT,
  REPORT_VISIBILITY_ITEMS,
  buildDefaultReportAppendix,
  buildDefaultReportVisibility,
  type ReportReleaseMode,
  type ReportVisibilityId,
  type ReportVisibilityItem,
} from '../reportSettings';

function VisibilityOption({
  item,
  draft,
  onToggle,
}: {
  item: ReportVisibilityItem;
  draft: Record<ReportVisibilityId, boolean>;
  onToggle: (id: ReportVisibilityId, checked: boolean) => void;
}) {
  return (
    <div className="report-settings__item">
      <label className="report-settings__option">
        <input
          type="checkbox"
          checked={draft[item.id] ?? true}
          onChange={(e) => onToggle(item.id, e.target.checked)}
        />
        <span>{item.title}</span>
      </label>
      {item.children && (
        <div className="report-settings__children">
          {item.children.map((child) => (
            <label key={child.id} className="report-settings__option report-settings__option--child">
              <input
                type="checkbox"
                checked={(draft[item.id] ?? true) && (draft[child.id] ?? true)}
                disabled={!(draft[item.id] ?? true)}
                onChange={(e) => onToggle(child.id, e.target.checked)}
              />
              <span>{child.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportSettings() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const defaultState = useMemo(() => buildDefaultReportVisibility(), []);
  const defaultAppendixState = useMemo(() => buildDefaultReportAppendix(), []);
  const [draft, setDraft] = useState<Record<ReportVisibilityId, boolean>>(defaultState);
  const [appendixDraft, setAppendixDraft] = useState<Record<ReportVisibilityId, boolean>>(defaultAppendixState);
  const [releaseMode, setReleaseMode] = useState<ReportReleaseMode>('draft');
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const requestSeqRef = useRef(0);
  const loadRequestSeqRef = useRef(0);

  useEffect(() => {
    const requestSeq = ++loadRequestSeqRef.current;
    requestSeqRef.current += 1;
    setSaveMessage('');
    setDraft(defaultState);
    setAppendixDraft(defaultAppendixState);
    setReleaseMode('draft');
    setSaving(false);
    setLoadingSettings(false);
    if (!profileId) {
      return;
    }
    let cancelled = false;
    setLoadingSettings(true);
    reportSettingsApi
      .get(profileId)
      .then((settings) => {
        if (cancelled || loadRequestSeqRef.current !== requestSeq) return;
        setDraft({ ...defaultState, ...settings.visible_sections });
        setAppendixDraft({ ...defaultAppendixState, ...settings.appendix_sections });
        setReleaseMode(settings.release_mode ?? 'draft');
      })
      .catch(() => {
        if (cancelled || loadRequestSeqRef.current !== requestSeq) return;
        setDraft(defaultState);
        setAppendixDraft(defaultAppendixState);
        setReleaseMode('draft');
      })
      .finally(() => {
        if (cancelled || loadRequestSeqRef.current !== requestSeq) return;
        setLoadingSettings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [defaultAppendixState, defaultState, profileId]);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  const handleToggle = (id: ReportVisibilityId, checked: boolean) => {
    setDraft((prev) => ({ ...prev, [id]: checked }));
  };

  const handleSave = async () => {
    if (!profileId) {
      setSaveMessage('No active profile selected');
      return;
    }
    const requestSeq = ++requestSeqRef.current;
    setSaving(true);
    try {
      const saved = await reportSettingsApi.update(profileId, {
        visible_sections: draft,
        appendix_sections: appendixDraft,
        release_mode: releaseMode,
      });
      if (requestSeqRef.current !== requestSeq) return;
      setDraft({ ...defaultState, ...saved.visible_sections });
      setAppendixDraft({ ...defaultAppendixState, ...saved.appendix_sections });
      setReleaseMode(saved.release_mode ?? 'draft');
      window.dispatchEvent(new CustomEvent(REPORT_SETTINGS_CHANGED_EVENT, { detail: { profileId } }));
      setSaveMessage('Settings saved');
    } catch {
      if (requestSeqRef.current === requestSeq) {
        setSaveMessage('Save failed');
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setSaving(false);
      }
    }
  };

  const handleReset = async () => {
    if (!profileId) {
      setSaveMessage('No active profile selected');
      return;
    }
    setDraft(defaultState);
    setAppendixDraft(defaultAppendixState);
    setReleaseMode('draft');
    const requestSeq = ++requestSeqRef.current;
    setSaving(true);
    try {
      await reportSettingsApi.update(profileId, {
        visible_sections: defaultState,
        appendix_sections: defaultAppendixState,
        release_mode: 'draft',
      });
      if (requestSeqRef.current !== requestSeq) return;
      window.dispatchEvent(new CustomEvent(REPORT_SETTINGS_CHANGED_EVENT, { detail: { profileId } }));
      setSaveMessage('Settings reset');
    } catch {
      if (requestSeqRef.current === requestSeq) {
        setSaveMessage('Reset failed');
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setSaving(false);
      }
    }
  };

  const includedCount = Object.values(draft).filter(Boolean).length;
  const totalCount = Object.keys(defaultState).length;
  const appendixCount = Object.values(appendixDraft).filter(Boolean).length;
  const actionStatusMessage = loadingSettings ? 'Loading settings…' : saveMessage;

  return (
    <PageLayout
      title="Report settings"
      subtitle="Control report structure, appendix placement, and delivery outputs for the current assessment."
    >
      <section className="report-settings">
        <div className="report-settings__header">
          <div>
            <h3>Report release mode</h3>
            <p>
              Control whether the report is marked as a draft baseline or issued as a major version.
            </p>
          </div>
        </div>

        <div className="report-settings__grid">
          <div className="report-settings__item">
            <label className="report-settings__option">
              <input
                type="radio"
                name="report-release-mode"
                checked={releaseMode === 'draft'}
                onChange={() => setReleaseMode('draft')}
              />
              <span>Draft</span>
            </label>
            <label className="report-settings__option">
              <input
                type="radio"
                name="report-release-mode"
                checked={releaseMode === 'major'}
                onChange={() => setReleaseMode('major')}
              />
              <span>Major version</span>
            </label>
          </div>
        </div>
      </section>

      <section className="report-settings">
        <div className="report-settings__header">
          <div>
            <h3>Exclusions and inclusions</h3>
            <p>
              Everything is included by default. Turn off any report section you do not want, or go one level deeper for
              subsections within sections that have detailed schedules.
            </p>
          </div>
          <div className="report-settings__actions">
            <span className="report-settings__summary">{includedCount} of {totalCount} items included</span>
            {actionStatusMessage && <span className="report-settings__summary">{actionStatusMessage}</span>}
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || loadingSettings}>{saving ? 'Saving...' : 'Save settings'}</button>
            <button type="button" className="btn" onClick={handleReset} disabled={saving || loadingSettings}>Reset to include all</button>
          </div>
        </div>

        <div className="report-settings__grid">
          {REPORT_VISIBILITY_ITEMS.map((item) => (
            <VisibilityOption key={item.id} item={item} draft={draft} onToggle={handleToggle} />
          ))}
        </div>
      </section>

      <section className="report-settings">
        <div className="report-settings__header">
          <div>
            <h3>Appendix</h3>
            <p>
              Tick any included section you want moved to the end of the report. The assessment report will add an
              Appendix section and place those selected sections there. Subsections can also be moved individually.
            </p>
          </div>
          <div className="report-settings__actions">
            <span className="report-settings__summary">{appendixCount} section{appendixCount === 1 ? '' : 's'} moved to appendix</span>
          </div>
        </div>

        <div className="report-settings__grid">
          {REPORT_VISIBILITY_ITEMS.map((item) => (
            <div key={`appendix-${item.id}`} className="report-settings__item">
              <label className="report-settings__option">
                <input
                  type="checkbox"
                  checked={(draft[item.id] ?? true) && (appendixDraft[item.id] ?? false)}
                  disabled={!(draft[item.id] ?? true)}
                  onChange={(e) => setAppendixDraft((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                />
                <span>{item.title}</span>
              </label>
              {item.children && (
                <div className="report-settings__children">
                  {item.children.map((child) => (
                    <label key={`appendix-${child.id}`} className="report-settings__option report-settings__option--child">
                      <input
                        type="checkbox"
                        checked={(draft[item.id] ?? true) && (draft[child.id] ?? true) && (appendixDraft[child.id] ?? false)}
                        disabled={!(draft[item.id] ?? true) || !(draft[child.id] ?? true) || (appendixDraft[item.id] ?? false)}
                        onChange={(e) => setAppendixDraft((prev) => ({ ...prev, [child.id]: e.target.checked }))}
                      />
                      <span>{child.title}</span>
                    </label>
                  ))}
                </div>
              )}
              {!(draft[item.id] ?? true) && (
                <p className="report-settings__hint">Include this section first if you want to move it to the appendix.</p>
              )}
              {(appendixDraft[item.id] ?? false) && item.children && (
                <p className="report-settings__hint">This parent section is already moving to the appendix, so child appendix selections are not needed.</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <ReportDeliveryExports />
    </PageLayout>
  );
}
