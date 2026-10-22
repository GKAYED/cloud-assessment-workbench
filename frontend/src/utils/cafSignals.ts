import type { CafMethodology } from '../api/framework';

const ENRICHED_CAF_SIGNALS: Record<string, string[]> = {
  strategy: [
    '9 applications catalogued in portfolio.',
    '9 apps have strategic fit scores and future-state classification.',
    'Kickoff and interview evidence indicates business and technical ownership remain unevenly defined across the estate.',
  ],
  plan: [
    '10 initiatives defined and target-dated.',
    'Portfolio-level planning exists, but transcript evidence indicates prioritisation and sequencing remain only partly mature.',
    'Important technical uplift work continues to compete poorly against immediate delivery demand.',
  ],
  ready: [
    '10 subscriptions, 60 resource groups, and 587 discovered resources indicate a material platform footprint.',
    'Tagging remains incomplete and limits traceability and operational readiness.',
    'Transcript evidence indicates weak change discipline, thin platform capacity, and assessment-access friction across key platform areas.',
  ],
  adopt: [
    '9 Dynamics environments were discovered through APIs, with a broader 14-environment platform footprint confirmed through manual exports.',
    '9 business applications are catalogued alongside the Azure estate evidence.',
    'Transcript evidence indicates fragmented ownership, vendor-created complexity, and weak traceability across Dynamics, B2C, and related platform assets.',
  ],
  govern: [
    'Multi-subscription environment and governance telemetry provide a reasonable baseline, but accountability remains unevenly defined in practice.',
    'Architecture and integration knowledge remain partly person-dependent rather than consistently documented.',
    'Transcript evidence supports a need for a lightweight but explicit operating model across Azure, Dynamics, integrations, and reporting.',
  ],
  secure: [
    'Low secure score (38%) indicates a significant security gap.',
    'Transcript evidence suggests the issue is less about awareness and more about limited capacity to sustain remediation.',
    'Security uplift has started, but support debt and handover gaps still affect execution.',
  ],
  manage: [
    '64 integrations have been identified and 7239 D365 workflows tracked.',
    'Transcript evidence indicates support capacity is too thin for the breadth of the current estate.',
    'Integration knowledge, contractor handover quality, and documentation discipline remain key management constraints.',
  ],
};

export function getEnrichedCafSignals(methodKey: string, methodology: CafMethodology): string[] {
  return ENRICHED_CAF_SIGNALS[methodKey] ?? methodology.signals ?? [];
}
