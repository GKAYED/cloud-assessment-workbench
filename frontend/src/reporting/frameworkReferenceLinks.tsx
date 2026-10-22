import { Fragment, type ReactNode } from 'react';

/** Map WAF checklist refs to the most relevant Microsoft Learn subsection URL. */
const WAF_CHECKLIST_LINKS: Record<string, string> = {
  'RE:03': 'https://learn.microsoft.com/en-us/azure/well-architected/reliability/failure-mode-analysis',
  'RE:05': 'https://learn.microsoft.com/azure/well-architected/reliability/redundancy#key-design-strategies',
  'RE:07': 'https://learn.microsoft.com/azure/well-architected/reliability/self-preservation#application-design-guidance-and-patterns',
  'RE:08': 'https://learn.microsoft.com/en-us/azure/well-architected/reliability/testing-strategy',
  'RE:09': 'https://learn.microsoft.com/en-us/azure/well-architected/reliability/disaster-recovery',
  'SE:01': 'https://learn.microsoft.com/azure/well-architected/security/establish-baseline#key-design-strategies',
  'SE:05': 'https://learn.microsoft.com/en-us/azure/architecture/framework/security/design-identity-role-definitions',
  'SE:06': 'https://learn.microsoft.com/en-us/azure/well-architected/security/networking',
  'SE:07': 'https://learn.microsoft.com/en-us/azure/well-architected/security/encryption',
  'SE:10': 'https://learn.microsoft.com/en-us/azure/well-architected/security/monitor-threats',
  'CO:01': 'https://learn.microsoft.com/azure/well-architected/cost-optimization/create-culture-financial-responsibility#communicate-financial-expectations',
  'CO:05': 'https://learn.microsoft.com/azure/well-architected/cost-optimization/optimize-spending#key-design-strategies',
  'OE:01': 'https://learn.microsoft.com/azure/well-architected/operational-excellence/devops-culture#team-roles-and-responsibilities',
  'OE:04': 'https://learn.microsoft.com/azure/well-architected/operational-excellence/continuous-integration#key-design-strategies',
  'OE:05': 'https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/infrastructure-as-code-design',
  'OE:06': 'https://learn.microsoft.com/en-us/azure/architecture/framework/devops/release-engineering-rollback',
  'OE:07': 'https://learn.microsoft.com/azure/well-architected/operational-excellence/observability#key-design-strategies',
  'PE:01': 'https://learn.microsoft.com/azure/well-architected/performance-efficiency/performance-targets#determine-performance-requirements',
  'PE:04': 'https://learn.microsoft.com/azure/well-architected/performance-efficiency/performance-targets#performance-targets',
  'PE:05': 'https://learn.microsoft.com/azure/well-architected/performance-efficiency/scale-partition#key-design-strategies',
  'PE:06': 'https://learn.microsoft.com/azure/well-architected/performance-efficiency/testing-optimization#evaluate-performance-by-using-performance-tests',
};

const REFERENCE_DOC_PATHS: Record<string, string> = {
  RE: 'reliability',
  SE: 'security',
  CO: 'cost-optimization',
  OE: 'operational-excellence',
  PE: 'performance-efficiency',
};

export function getReferenceDocUrl(referenceCode: string): string | null {
  const exact = WAF_CHECKLIST_LINKS[referenceCode.toUpperCase()];
  if (exact) return exact;
  const key = referenceCode.slice(0, 2).toUpperCase();
  const docPath = REFERENCE_DOC_PATHS[key];
  if (!docPath) return null;
  return `https://learn.microsoft.com/azure/architecture/framework/${docPath}`;
}

export function wafRefLink(ref: string): ReactNode {
  if (!ref) return '—';
  const url = getReferenceDocUrl(ref);
  if (url) return <a href={url} target="_blank" rel="noopener noreferrer">{ref}</a>;
  return ref;
}

export function renderReferenceList(refs: string | null | undefined): ReactNode {
  const items = String(refs ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) return '—';
  return (
    <span className="rpt-reference-list">
      {items.map((ref, index) => (
        <Fragment key={`${ref}-${index}`}>
          {index > 0 ? ', ' : null}
          {wafRefLink(ref)}
        </Fragment>
      ))}
    </span>
  );
}
