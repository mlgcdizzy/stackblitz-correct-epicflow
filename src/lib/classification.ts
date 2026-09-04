import type { Epic, User, Team } from './types';
import { findOwnerName, findTeamName } from './lookups';

export type GroupByKey = 'component' | 'fixVersion' | 'productArea' | 'status' | 'owner' | 'team' | 'riskLevel' | 'demandDriver' | 'budget' | 'none';

export const GROUP_BY_OPTIONS: { value: GroupByKey; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'demandDriver', label: 'Demand Driver' },
  { value: 'component', label: 'Component' },
  { value: 'budget', label: 'Budget' },
  { value: 'fixVersion', label: 'Fix Version' },
  { value: 'productArea', label: 'Product Area' },
  { value: 'status', label: 'Status' },
  { value: 'owner', label: 'Owner' },
  { value: 'team', label: 'Team' },
  { value: 'riskLevel', label: 'Risk Level' },
];

export interface EpicGroup {
  key: string;
  label: string;
  epics: Epic[];
}

/** Groups epics by the chosen dimension. Epics missing that field land in an "Unclassified" bucket rather than being dropped. */
export function groupEpics(epics: Epic[], by: GroupByKey, users: User[], teams: Team[]): EpicGroup[] {
  if (by === 'none') {
    return [{ key: 'all', label: 'All Epics', epics }];
  }

  const buckets = new Map<string, Epic[]>();

  for (const epic of epics) {
    let label: string;
    switch (by) {
      case 'component':
        label = epic.component || 'Unclassified';
        break;
      case 'fixVersion':
        label = epic.fixVersion || 'No fix version';
        break;
      case 'productArea':
        label = epic.productArea || 'Unclassified';
        break;
      case 'status':
        label = epic.status;
        break;
      case 'owner':
        label = findOwnerName(users, epic.ownerId);
        break;
      case 'team':
        label = findTeamName(teams, epic.teamId);
        break;
      case 'riskLevel':
        label = epic.riskLevel;
        break;
      case 'demandDriver':
        label = epic.demandDriver || 'No demand driver';
        break;
      case 'budget':
        label = epic.budget || 'Unclassified';
        break;
      default:
        label = 'Unclassified';
    }
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(epic);
  }

  return Array.from(buckets.entries())
    .map(([key, groupEpics]) => ({ key, label: key, epics: groupEpics }))
    .sort((a, b) => b.epics.length - a.epics.length);
}

// ---------------------------------------------------------------------------
// Group suggestions
//
// Never silently assigns a group to an epic that already has one — this is
// purely additive: it only ever proposes a value for epics where `component`
// is empty, and nothing is written until the person approves it.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'and', 'or', 'of', 'to', 'in', 'on', 'with', 'by', 'is', 'are',
  'new', 'update', 'updates', 'support', 'add', 'adding', 'improve', 'improvement', 'fix',
  'implementation', 'implement', 'v1', 'v2', 'mvp', 'phase',
]);

function titleKeywords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

export interface GroupSuggestion {
  epicId: string;
  suggestedComponent: string;
  confidence: 'high' | 'medium' | 'low';
  matchedOn: string; // short human-readable reason
}

/**
 * Suggests a Component for every epic that doesn't already have one, based
 * on title-keyword overlap with already-classified epics. Returns nothing
 * for epics that already have a component — those are never touched.
 */
export function suggestGroupsForUnclassified(epics: Epic[]): GroupSuggestion[] {
  const classified = epics.filter((e) => e.component);
  const unclassified = epics.filter((e) => !e.component);
  if (classified.length === 0 || unclassified.length === 0) return [];

  // Pre-compute keyword sets per known component from its classified epics' titles.
  const keywordsByComponent = new Map<string, Map<string, number>>();
  for (const e of classified) {
    const comp = e.component!;
    if (!keywordsByComponent.has(comp)) keywordsByComponent.set(comp, new Map());
    const freq = keywordsByComponent.get(comp)!;
    for (const kw of titleKeywords(e.title)) freq.set(kw, (freq.get(kw) ?? 0) + 1);
  }

  const suggestions: GroupSuggestion[] = [];

  for (const epic of unclassified) {
    const kws = titleKeywords(epic.title);
    if (kws.size === 0) continue;

    let best: { component: string; score: number; matched: string[] } | null = null;
    for (const [comp, freq] of keywordsByComponent.entries()) {
      let score = 0;
      const matched: string[] = [];
      for (const kw of kws) {
        const f = freq.get(kw);
        if (f) {
          score += f;
          matched.push(kw);
        }
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { component: comp, score, matched };
      }
    }

    if (best) {
      const confidence: GroupSuggestion['confidence'] = best.score >= 4 ? 'high' : best.score >= 2 ? 'medium' : 'low';
      suggestions.push({
        epicId: epic.id,
        suggestedComponent: best.component,
        confidence,
        matchedOn: best.matched.slice(0, 3).join(', '),
      });
    }
  }

  return suggestions;
}

/** Same idea, single-epic version — used by the New Epic form to suggest a group as you type a title. */
export function suggestGroupForTitle(title: string, epics: Epic[]): string | null {
  const kws = titleKeywords(title);
  if (kws.size === 0) return null;

  const classified = epics.filter((e) => e.component);
  if (classified.length === 0) return null;

  const scoreByComponent = new Map<string, number>();
  for (const e of classified) {
    const overlap = [...titleKeywords(e.title)].filter((kw) => kws.has(kw)).length;
    if (overlap > 0) scoreByComponent.set(e.component!, (scoreByComponent.get(e.component!) ?? 0) + overlap);
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [comp, score] of scoreByComponent.entries()) {
    if (score > bestScore) {
      best = comp;
      bestScore = score;
    }
  }
  return best;
}
