import { describe, expect, it } from 'vitest';

import { applySavedInterpretationSection, resolveInterpretationText, sortInterpretationSections } from '../reportInterpretation';
import type { ReportInterpretationSectionRecord, ReportInterpretationStateRecord } from '../../api/reportInterpretation';

describe('report interpretation helpers', () => {
  it('prefers final text, then edited text, then generated text', () => {
    expect(resolveInterpretationText({
      run_id: 1,
      section_key: 'executive_summary',
      source_kind: 'edited',
      generated_text: 'generated',
      edited_text: 'edited',
      final_text: 'final',
    })).toBe('final');

    expect(resolveInterpretationText({
      run_id: 1,
      section_key: 'executive_summary',
      source_kind: 'edited',
      generated_text: 'generated',
      edited_text: 'edited',
      final_text: null,
    })).toBe('edited');
  });

  it('sorts sections into the canonical v2 order', () => {
    const sections: ReportInterpretationSectionRecord[] = [
      { run_id: 1, section_key: 'leadership_takeaways', source_kind: 'generated' },
      { run_id: 1, section_key: 'business_context', source_kind: 'generated' },
      { run_id: 1, section_key: 'executive_summary', source_kind: 'generated' },
    ];

    expect(sortInterpretationSections(sections).map((item) => item.section_key)).toEqual([
      'executive_summary',
      'business_context',
      'leadership_takeaways',
    ]);
  });

  it('marks the local current run edited after a section save', () => {
    const state: ReportInterpretationStateRecord = {
      profile_id: 7,
      report_version: 'v2',
      has_snapshot: true,
      current_run: {
        id: 1,
        profile_id: 7,
        report_version: 'v2',
        status: 'draft',
        approved: false,
        is_current: true,
        generation_trigger: 'generate',
        sections: [
          { run_id: 1, section_key: 'executive_summary', source_kind: 'generated', final_text: 'old' },
        ],
      },
      sections: [
        { run_id: 1, section_key: 'executive_summary', source_kind: 'generated', final_text: 'old' },
      ],
    };

    const next = applySavedInterpretationSection(state, {
      run_id: 1,
      section_key: 'executive_summary',
      source_kind: 'edited',
      final_text: 'new',
    });

    expect(next.current_run?.status).toBe('edited');
    expect(next.current_run?.sections[0]?.final_text).toBe('new');
    expect(next.sections[0]?.final_text).toBe('new');
  });
});
