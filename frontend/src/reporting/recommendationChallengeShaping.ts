import type { Challenge, Recommendation } from '../types';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function summarizeRecommendationThemes(recommendations: Recommendation[] | null): string {
  if (!recommendations || recommendations.length === 0) {
    return 'This section consolidates the strategic recommendation themes visible in the current profile.';
  }

  const byCategory = new Map<string, number>();
  for (const item of recommendations) {
    const key = item.category?.trim() || 'Uncategorised';
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }

  const leaders = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => `${key} (${count})`);

  return [
    'The recommendations below should be read as a change portfolio, not a flat action list, because they represent multiple themes that will likely require sequencing and ownership.',
    leaders.length > 0
      ? `The heaviest recommendation themes currently sit in ${leaders.join(', ')}.`
      : 'Recommendation themes are still emerging from the current profile data.',
  ].join(' ');
}

export function summarizeChallengeThemes(challenges: Challenge[] | null): string {
  if (!challenges || challenges.length === 0) {
    return 'This section captures the recurring challenge themes visible across the current evidence set.';
  }

  const byCategory = new Map<string, number>();
  for (const item of challenges) {
    const key = item.category?.trim() || 'Cross-cutting';
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }

  const leaders = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => `${key} (${count})`);

  return [
    'The challenge set should be read as a pattern map of recurring issues rather than isolated defects in individual systems or teams.',
    leaders.length > 0
      ? `The strongest recurring themes currently sit in ${leaders.join(', ')}.`
      : 'The challenge themes are still emerging from the current evidence set.',
  ].join(' ');
}

export function narrativeRecommendations(recommendations: Recommendation[] | null): string {
  if (!recommendations || recommendations.length === 0) {
    return 'No customer-facing recommendations have been recorded yet.';
  }

  const p1Count = recommendations.filter((item) => item.priority === 'P1').length;
  const p2Count = recommendations.filter((item) => item.priority === 'P2').length;
  const manualCount = recommendations.filter((item) => item.manual_entry).length;
  const broadCount = recommendations.filter((item) => item.reinforcement_level === 'Strong cross-transcript').length;
  const parts: string[] = [];

  parts.push(`${plural(recommendations.length, 'recommendation')} have been captured for the current profile, and they should be read as a sequenced change portfolio rather than a flat list of equally urgent items.`);

  if (p1Count > 0) {
    parts.push(`${plural(p1Count, 'item')} are currently marked as Priority 1 and represent the strongest immediate leadership and operating-model priorities.`);
  }
  if (p2Count > 0) {
    parts.push(`${plural(p2Count, 'item')} sit in Priority 2, which makes them important follow-on enablers once the immediate stabilisation and control work is underway.`);
  }
  if (broadCount > 0) {
    parts.push(`${plural(broadCount, 'recommendation')} are reinforced across multiple transcript sources.`);
  }
  if (manualCount > 0) {
    parts.push(`${plural(manualCount, 'recommendation')} were added manually in the app and should be reconciled against transcript evidence as needed.`);
  }

  return parts.join(' ');
}

export function narrativeChallenges(challenges: Challenge[] | null): string {
  if (!challenges || challenges.length === 0) {
    return 'No recurring cross-transcript challenges have been recorded yet.';
  }

  const highImpact = challenges.filter((item) => item.impact_level === 'High' || item.impact_level === 'Critical').length;
  const capabilityLinked = challenges.filter((item) => (item.capability_opportunities?.length ?? 0) > 0).length;
  const parts: string[] = [];

  parts.push(`${plural(challenges.length, 'challenge')} have been consolidated from the current transcript set, and together they describe an estate that is broadly workable but under strain in ownership clarity, delivery discipline, cleanup, and support capacity.`);
  if (highImpact > 0) {
    parts.push(`${plural(highImpact, 'item')} are currently assessed as high impact or critical.`);
  }
  if (capabilityLinked > 0) {
    parts.push(`${plural(capabilityLinked, 'challenge')} are already linked to explicit capability, role-clarity, or resourcing opportunities.`);
  }

  return parts.join(' ');
}
