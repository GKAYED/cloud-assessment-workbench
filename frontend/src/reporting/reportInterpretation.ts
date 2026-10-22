import type {
  ReportInterpretationSectionRecord,
  ReportInterpretationStateRecord,
} from '../api/reportInterpretation';

export const REPORT_V2_SECTION_ORDER = [
  'executive_summary',
  'business_context',
  'estate_interpretation',
  'security_interpretation',
  'governance_interpretation',
  'cost_interpretation',
  'recommendation_context',
  'leadership_takeaways',
] as const;

export type ReportV2SectionKey = (typeof REPORT_V2_SECTION_ORDER)[number];

export const REPORT_V2_SECTION_LABELS: Record<ReportV2SectionKey, string> = {
  executive_summary: 'Executive Summary',
  business_context: 'Business Context',
  estate_interpretation: 'Estate Interpretation',
  security_interpretation: 'Security Interpretation',
  governance_interpretation: 'Governance Interpretation',
  cost_interpretation: 'Cost Interpretation',
  recommendation_context: 'Recommendation Context',
  leadership_takeaways: 'Leadership Takeaways',
};

export function resolveInterpretationText(section: ReportInterpretationSectionRecord | null | undefined): string {
  if (!section) return '';
  return (section.final_text ?? section.edited_text ?? section.generated_text ?? '').trim();
}

export function sortInterpretationSections(
  sections: ReportInterpretationSectionRecord[],
): ReportInterpretationSectionRecord[] {
  const order = new Map(REPORT_V2_SECTION_ORDER.map((key, index) => [key, index]));
  return [...sections].sort((left, right) => {
    const leftOrder = order.get(left.section_key as ReportV2SectionKey) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.section_key as ReportV2SectionKey) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.section_key.localeCompare(right.section_key);
  });
}

export function applySavedInterpretationSection(
  state: ReportInterpretationStateRecord,
  updatedSection: ReportInterpretationSectionRecord,
): ReportInterpretationStateRecord {
  const nextSections = state.sections.map((item) => (
    item.section_key === updatedSection.section_key ? updatedSection : item
  ));

  return {
    ...state,
    current_run: state.current_run
      ? {
          ...state.current_run,
          approved: false,
          approved_at: null,
          approved_by: null,
          status: 'edited',
          sections: nextSections,
        }
      : state.current_run,
    sections: nextSections,
  };
}
