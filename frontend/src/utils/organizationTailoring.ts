import type { OrganizationContext } from '../types';

export interface TailoringGuidance {
  capabilityLeadIn: string;
  recommendationLeadIn: string;
  recommendationTitleHint: string;
}

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function smallOrgRewrite(text: string): string {
  return clean(
    text
      .replace(/\bcapability uplift\b/gi, 'practical capability strengthening')
      .replace(/\boperating model\b/gi, 'way of working')
      .replace(/\bgovernance operating rhythm\b/gi, 'lightweight governance cadence')
      .replace(/\barchitecture mapping discipline\b/gi, 'practical architecture mapping')
      .replace(/\bportfolio and Azure DevOps management capability uplift\b/gi, 'practical portfolio and delivery-management habits')
      .replace(/\btechnical change management and release discipline uplift\b/gi, 'practical change and release discipline')
      .replace(/\bownership model and accountability uplift\b/gi, 'clear ownership and accountability')
      .replace(/\bongoing Azure governance capability uplift\b/gi, 'lightweight Azure governance habits')
      .replace(/\bAzure platform and cloud operating model capability uplift\b/gi, 'day-to-day Azure platform support capability')
  );
}

function mediumOrgRewrite(text: string): string {
  return clean(
    text
      .replace(/\bcapability uplift\b/gi, 'capability strengthening')
      .replace(/\bgovernance operating rhythm\b/gi, 'governance cadence')
      .replace(/\barchitecture mapping discipline\b/gi, 'architecture mapping practice')
  );
}

export function tailorPresentationText(text: string | null | undefined, org: OrganizationContext | null | undefined): string {
  const source = clean(text);
  if (!source) return '';
  const size = org?.organisation_size;
  if (size === 'Small') return smallOrgRewrite(source);
  if (size === 'Medium') return mediumOrgRewrite(source);
  return source;
}

export function tailoringGuidance(org: OrganizationContext | null | undefined): TailoringGuidance {
  switch (org?.organisation_size) {
    case 'Small':
      return {
        capabilityLeadIn: 'These opportunities are framed for a small internal team, with an emphasis on lightweight habits, clearer ownership, and targeted external support where needed.',
        recommendationLeadIn: 'These recommendations are presented as practical, manageable next steps for a smaller team and should be read as incremental improvements rather than large transformation-program requirements.',
        recommendationTitleHint: 'Practical recommendation',
      };
    case 'Medium':
      return {
        capabilityLeadIn: 'These opportunities are framed for a mid-sized team, balancing stronger internal practices with selective specialist support where complexity justifies it.',
        recommendationLeadIn: 'These recommendations are presented as pragmatic capability and governance improvements that can be sequenced over time without assuming a large enterprise operating model.',
        recommendationTitleHint: 'Target recommendation',
      };
    case 'Large':
      return {
        capabilityLeadIn: 'These opportunities assume a broader internal team and are framed to strengthen repeatable capability, handover quality, and clearer control points across domains.',
        recommendationLeadIn: 'These recommendations are presented as structured improvements that can be owned across teams while remaining grounded in the current evidence base.',
        recommendationTitleHint: 'Strategic recommendation',
      };
    case 'Enterprise':
      return {
        capabilityLeadIn: 'These opportunities are framed for a larger operating environment and emphasise repeatability, control, formal ownership, and scalable governance practices.',
        recommendationLeadIn: 'These recommendations are presented as strategic operating-model improvements suitable for a more formal and distributed delivery environment.',
        recommendationTitleHint: 'Strategic recommendation',
      };
    default:
      return {
        capabilityLeadIn: 'These opportunities have been framed as practical follow-on capabilities based on the current assessment evidence.',
        recommendationLeadIn: 'These recommendations are presented as evidence-backed next steps and can be tailored further once the organisation context is confirmed.',
        recommendationTitleHint: 'Recommendation',
      };
  }
}
