import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ImagePlus, Trash2 } from 'lucide-react';
import { organizationApi } from '../api/organization';
import { PageLayout } from '../components/layout/PageLayout';
import { useProfile } from '../hooks/useProfile';
import type { OrganisationSize, OrganizationContextUpdate, OrganizationImage } from '../types';
import { isRequestCancellationError } from '../utils/requestErrors';

const SIZE_OPTIONS: OrganisationSize[] = ['Small', 'Medium', 'Large', 'Enterprise'];

const emptyForm: OrganizationContextUpdate = {
  organisation_size: 'Medium',
  organisation_overview: '',
  assessment_scope_notes: '',
  assessment_boundary_notes: '',
  leadership_context_notes: '',
  operating_model_notes: '',
  it_team_summary: '',
  vendor_dependency_notes: '',
  tailoring_notes: '',
  org_structure_image_name: '',
  org_structure_image_data: '',
  it_team_structure_image_name: '',
  it_team_structure_image_data: '',
  it_team_structure_images: [],
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

function ImageField({
  label,
  imageName,
  imageData,
  onChange,
  onClear,
}: {
  label: string;
  imageName?: string | null;
  imageData?: string | null;
  onChange: (file: File) => Promise<void>;
  onClear: () => void;
}) {
  const handleFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    await onChange(file);
  };

  return (
    <div className="org-card org-card--image">
      <div className="org-card__header">
        <div>
          <h3>{label}</h3>
          <p>Upload or paste a screenshot so future wording and report framing can reflect the delivery context.</p>
        </div>
        {imageData && (
          <button type="button" className="btn btn-sm" onClick={onClear}>
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>
      <label
        className="org-image-dropzone"
        onPaste={async (event) => {
          const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith('image/'));
          const file = item?.getAsFile();
          if (file) {
            event.preventDefault();
            await onChange(file);
          }
        }}
      >
        <input
          type="file"
          accept="image/*"
          onChange={async (event) => handleFile(event.target.files)}
        />
        {imageData ? (
          <img src={imageData} alt={imageName ?? label} className="org-image-preview" />
        ) : (
          <div className="org-image-dropzone__empty">
            <ImagePlus size={20} />
            <span>Click to upload or paste an image</span>
          </div>
        )}
      </label>
      <div className="org-image-meta">{imageName || 'No image uploaded yet'}</div>
    </div>
  );
}

function MultiImageField({
  label,
  images,
  onAdd,
  onRemove,
}: {
  label: string;
  images: OrganizationImage[];
  onAdd: (file: File) => Promise<void>;
  onRemove: (index: number) => void;
}) {
  const handleFile = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    for (const file of files) {
      await onAdd(file);
    }
  };

  return (
    <div className="org-card org-card--image">
      <div className="org-card__header">
        <div>
          <h3>{label}</h3>
          <p>Add each diagram or screenshot separately so the report can present them as distinct artefacts.</p>
        </div>
      </div>
      <label
        className="org-image-dropzone"
        onPaste={async (event) => {
          const items = Array.from(event.clipboardData.items).filter((entry) => entry.type.startsWith('image/'));
          if (items.length > 0) {
            event.preventDefault();
            for (const item of items) {
              const file = item.getAsFile();
              if (file) await onAdd(file);
            }
          }
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (event) => handleFile(event.target.files)}
        />
        <div className="org-image-dropzone__empty">
          <ImagePlus size={20} />
          <span>Click to upload or paste one or more images</span>
        </div>
      </label>
      {images.length > 0 ? (
        <div className="org-image-gallery">
          {images.map((image, index) => (
            <div key={`${image.name ?? 'image'}-${index}`} className="org-image-gallery__item">
              {image.data && <img src={image.data} alt={image.name ?? `${label} ${index + 1}`} className="org-image-preview" />}
              <div className="org-image-gallery__meta">
                <span>{image.name || `Image ${index + 1}`}</span>
                <button type="button" className="btn btn-sm" onClick={() => onRemove(index)}>
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="org-image-meta">No images uploaded yet</div>
      )}
    </div>
  );
}

export default function AboutOrganisation() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const [form, setForm] = useState<OrganizationContextUpdate>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const subtitle = useMemo(
    () => 'Capture the organisational context, team structure, and operating model assumptions that shape how this assessment should be interpreted.',
    [],
  );

  const loadContext = useCallback(async () => {
    if (!profileId) return;
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await organizationApi.get(profileId);
      if (requestSeqRef.current !== requestSeq) return;
      setForm({
        organisation_size: (data.organisation_size as OrganisationSize | null) ?? 'Medium',
        organisation_overview: data.organisation_overview ?? '',
        assessment_scope_notes: data.assessment_scope_notes ?? '',
        assessment_boundary_notes: data.assessment_boundary_notes ?? '',
        leadership_context_notes: data.leadership_context_notes ?? '',
        operating_model_notes: data.operating_model_notes ?? '',
        it_team_summary: data.it_team_summary ?? '',
        vendor_dependency_notes: data.vendor_dependency_notes ?? '',
        tailoring_notes: data.tailoring_notes ?? '',
        org_structure_image_name: data.org_structure_image_name ?? '',
        org_structure_image_data: data.org_structure_image_data ?? '',
        it_team_structure_image_name: data.it_team_structure_image_name ?? '',
        it_team_structure_image_data: data.it_team_structure_image_data ?? '',
        it_team_structure_images: data.it_team_structure_images ?? (
          data.it_team_structure_image_data
            ? [{ name: data.it_team_structure_image_name ?? 'IT team structure', data: data.it_team_structure_image_data }]
            : []
        ),
      });
    } catch (err) {
      if (isRequestCancellationError(err) || requestSeqRef.current !== requestSeq) return;
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load organisation context.');
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => {
    requestSeqRef.current += 1;
    setLoading(false);
    setSaving(false);
    setErrorMessage(null);
    if (!profileId) {
      setForm(emptyForm);
      return;
    }
    setForm(emptyForm);
    void loadContext();
  }, [loadContext, profileId]);

  const setField = <K extends keyof OrganizationContextUpdate>(field: K, value: OrganizationContextUpdate[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (
    file: File,
    dataField: 'org_structure_image_data' | 'it_team_structure_image_data',
    nameField: 'org_structure_image_name' | 'it_team_structure_image_name',
  ) => {
    const dataUrl = await fileToDataUrl(file);
    setForm((prev) => ({ ...prev, [dataField]: dataUrl, [nameField]: file.name }));
  };

  const handleAddItTeamImage = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setForm((prev) => {
      const nextImages = [...(prev.it_team_structure_images ?? []), { name: file.name, data: dataUrl }];
      return {
        ...prev,
        it_team_structure_images: nextImages,
        it_team_structure_image_name: nextImages[0]?.name ?? '',
        it_team_structure_image_data: nextImages[0]?.data ?? '',
      };
    });
  };

  const handleSave = async () => {
    if (!profileId) return;
    const requestSeq = ++requestSeqRef.current;
    setSaving(true);
    setErrorMessage(null);
    try {
      const saved = await organizationApi.update(profileId, form);
      if (requestSeqRef.current !== requestSeq) return;
      setForm({
        organisation_size: (saved.organisation_size as OrganisationSize | null) ?? 'Medium',
        organisation_overview: saved.organisation_overview ?? '',
        assessment_scope_notes: saved.assessment_scope_notes ?? '',
        assessment_boundary_notes: saved.assessment_boundary_notes ?? '',
        leadership_context_notes: saved.leadership_context_notes ?? '',
        operating_model_notes: saved.operating_model_notes ?? '',
        it_team_summary: saved.it_team_summary ?? '',
        vendor_dependency_notes: saved.vendor_dependency_notes ?? '',
        tailoring_notes: saved.tailoring_notes ?? '',
        org_structure_image_name: saved.org_structure_image_name ?? '',
        org_structure_image_data: saved.org_structure_image_data ?? '',
        it_team_structure_image_name: saved.it_team_structure_image_name ?? '',
        it_team_structure_image_data: saved.it_team_structure_image_data ?? '',
        it_team_structure_images: saved.it_team_structure_images ?? (
          saved.it_team_structure_image_data
            ? [{ name: saved.it_team_structure_image_name ?? 'IT team structure', data: saved.it_team_structure_image_data }]
            : []
        ),
      });
    } catch (err) {
      if (isRequestCancellationError(err) || requestSeqRef.current !== requestSeq) return;
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save organisation context.');
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setSaving(false);
      }
    }
  };

  if (!profileId) {
    return (
      <PageLayout title="About organisation" subtitle={subtitle}>
        <p className="empty-state">Select a customer profile to capture organisation context.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="About organisation" subtitle={subtitle}>
      <section className="org-page">
        <div className="initiative-summary-grid">
          <div className="initiative-summary-card initiative-summary-card--blue">
            <span className="initiative-summary-label">Organisation size</span>
            <strong>{form.organisation_size ?? 'Not set'}</strong>
            <p>This setting drives the presentation tone used in final-report recommendations and capability opportunities.</p>
          </div>
          <div className="initiative-summary-card initiative-summary-card--green">
            <span className="initiative-summary-label">Tailoring approach</span>
            <strong>Presentation only</strong>
            <p>Raw assessment data stays unchanged. The report adapts the language used to present it.</p>
          </div>
        </div>

        <div className="org-layout-grid">
          <div className="org-card">
            <div className="org-card__header">
              <div>
                <h3>Organisation profile</h3>
                <p>Add the business and team context that should influence how findings are framed.</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
                {saving ? 'Saving…' : 'Save organisation context'}
              </button>
            </div>
            {errorMessage && <p className="error-text" role="alert">{errorMessage}</p>}

            <div className="crud-form-grid">
              <label>
                Organisation size
                <select
                  value={form.organisation_size ?? 'Medium'}
                  onChange={(event) => setField('organisation_size', event.target.value as OrganisationSize)}
                >
                  {SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <label>
                Profile
                <div className="org-profile-pill">
                  <Building2 size={16} />
                  <span>{activeProfile?.customer_name}</span>
                </div>
              </label>
              <label className="span-full">
                Organisation overview
                <textarea
                  rows={4}
                  value={form.organisation_overview ?? ''}
                  onChange={(event) => setField('organisation_overview', event.target.value)}
                  placeholder="Describe what the organisation does, how technology supports it, and any useful assessment context."
                />
              </label>
              <label className="span-full">
                Assessment scope notes
                <textarea
                  rows={3}
                  value={form.assessment_scope_notes ?? ''}
                  onChange={(event) => setField('assessment_scope_notes', event.target.value)}
                  placeholder="Describe any profile-specific scope framing that should appear in the executive report."
                />
              </label>
              <label className="span-full">
                Assessment boundary notes
                <textarea
                  rows={3}
                  value={form.assessment_boundary_notes ?? ''}
                  onChange={(event) => setField('assessment_boundary_notes', event.target.value)}
                  placeholder="Describe excluded platforms, access limitations, or later-phase review areas for this profile."
                />
              </label>
              <label className="span-full">
                Leadership context notes
                <textarea
                  rows={3}
                  value={form.leadership_context_notes ?? ''}
                  onChange={(event) => setField('leadership_context_notes', event.target.value)}
                  placeholder="Add executive framing that should be specific to this customer profile rather than hardcoded into the report."
                />
              </label>
              <label className="span-full">
                IT team summary
                <textarea
                  rows={4}
                  value={form.it_team_summary ?? ''}
                  onChange={(event) => setField('it_team_summary', event.target.value)}
                  placeholder="Summarise internal IT capacity, key roles, known gaps, and where external vendors are relied upon."
                />
              </label>
              <label className="span-full">
                Operating model notes
                <textarea
                  rows={4}
                  value={form.operating_model_notes ?? ''}
                  onChange={(event) => setField('operating_model_notes', event.target.value)}
                  placeholder="Capture decision-making style, support boundaries, change ownership, and how work gets done in practice."
                />
              </label>
              <label className="span-full">
                Vendor dependency notes
                <textarea
                  rows={3}
                  value={form.vendor_dependency_notes ?? ''}
                  onChange={(event) => setField('vendor_dependency_notes', event.target.value)}
                  placeholder="Note major vendors, contractor dependence, and any support or handover constraints."
                />
              </label>
              <label className="span-full">
                Additional notes
                <textarea
                  rows={3}
                  value={form.tailoring_notes ?? ''}
                  onChange={(event) => setField('tailoring_notes', event.target.value)}
                  placeholder="Optional: specify tone preferences such as practical language, executive wording, or stronger focus on manageable next steps."
                />
              </label>
            </div>
          </div>

          <div className="org-image-grid">
            <ImageField
              label="Organisation structure"
              imageName={form.org_structure_image_name}
              imageData={form.org_structure_image_data}
              onChange={(file) => handleImageUpload(file, 'org_structure_image_data', 'org_structure_image_name')}
              onClear={() => setForm((prev) => ({ ...prev, org_structure_image_name: '', org_structure_image_data: '' }))}
            />
            <MultiImageField
              label="IT team structure"
              images={form.it_team_structure_images ?? []}
              onAdd={handleAddItTeamImage}
              onRemove={(index) =>
                setForm((prev) => {
                  const nextImages = (prev.it_team_structure_images ?? []).filter((_, itemIndex) => itemIndex !== index);
                  return {
                    ...prev,
                    it_team_structure_images: nextImages,
                    it_team_structure_image_name: nextImages[0]?.name ?? '',
                    it_team_structure_image_data: nextImages[0]?.data ?? '',
                  };
                })
              }
            />
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
