import { nameFromResourceId, resolveSubscriptionName } from './costShaping';
import { titleCase } from '../utils/formatters';

export function shortType(t: string): string {
  return t.replace(/^microsoft\./i, '').replace(/\//g, ' / ');
}

export function looksLikeId(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || s.length > 50;
}

const ADVISOR_PILLAR_NAMES: Record<string, string> = {
  cost: 'Cost',
  security: 'Security',
  highavailability: 'Reliability',
  operationalexcellence: 'Operational Excellence',
  performance: 'Performance Efficiency',
};

export function readablePillar(raw: string): string {
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '');
  return ADVISOR_PILLAR_NAMES[lower] ?? titleCase(raw);
}

export function isSubscriptionId(value: string): boolean {
  const raw = (value ?? '').trim();
  if (!raw) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

export function replaceSubscriptionIdsInText(text: string, subscriptionNames: Map<string, string>): string {
  let result = text ?? '';
  for (const [id, name] of subscriptionNames.entries()) {
    if (!id || !name || id === name) continue;
    result = result.split(id).join(name);
  }
  return result;
}

export function advisorResourceDisplay(
  recommendation: { resource_name?: string; resource_id: string; resource_type: string; subscription_name?: string; subscription_id?: string },
  subscriptionNames: Map<string, string>,
): { name: string; subscription: string } {
  const preferredName =
    recommendation.resource_name && !looksLikeId(recommendation.resource_name)
      ? recommendation.resource_name
      : nameFromResourceId(recommendation.resource_id, shortType(recommendation.resource_type));
  return {
    name: replaceSubscriptionIdsInText(preferredName, subscriptionNames),
    subscription: resolveSubscriptionName(recommendation.subscription_name, recommendation.subscription_id, subscriptionNames),
  };
}

export { nameFromResourceId, resolveSubscriptionName };
