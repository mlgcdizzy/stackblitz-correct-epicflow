'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { groupEpics, GROUP_BY_OPTIONS, type GroupByKey } from '@/lib/classification';
import { classifyQuadrant, QUADRANT_LABELS, type Quadrant } from '@/lib/prioritization';
import { Card, CardHeader } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Database, ArrowRight, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import type { Epic } from '@/lib/types';
import { EPIC_STATUSES } from '@/lib/types';

const QUADRANT_COLOR: Record<Quadrant, string> = {
  'quick-wins': 'bg-health-green/10 border-health-green/30',
  'major-projects': 'bg-ink-100 border-ink-300',
  'fill-ins': 'bg-status-idea/10 border-status-idea/30',
  avoid: 'bg-health-red/10 border-health-red/30',
};

const QUADRANT_HINTS: Record<Quadrant, string> = {
  'quick-wins': 'High value, low effort — prioritize first',
  'major-projects': 'High value, high effort — sequence deliberately',
  'fill-ins': 'Low value, low effort — schedule opportunistically',
  avoid: 'Low value, high effort — deprioritize or cancel',
};

const TARGET_BY_QUADRANT: Record<Quadrant, [number, number]> = {
  'quick-wins': [8, 3],
  'major-projects': [8, 8],
  'fill-ins': [3, 3],
  avoid: [3, 8],
};

const MID = 5.5;

interface GroupCard {
  key: string;
  label: string;
  epics: Epic[];
  quadrant: Quadrant | null; // null = unclassified
}

export default function MatrixPage() {
  const { epics, users, teams, loading, refresh } = usePortfolio();
  const [groupBy, setGroupBy] = useState<GroupByKey>('demandDriver');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [componentFilter, setComponentFilter] = useState('ALL');
  const [budgetFilter, setBudgetFilter] = useState('ALL');
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const activeEpics = useMemo(() => epics.filter((e) => !['RELEASED', 'CANCELLED'].includes(e.status)), [epics]);

  const components = useMemo(() => Array.from(new Set(activeEpics.map((e) => e.component).filter(Boolean))) as string[], [activeEpics]);
  const budgets = useMemo(() => Array.from(new Set(activeEpics.map((e) => e.budget).filter(Boolean))) as string[], [activeEpics]);

  const filteredEpics = useMemo(() => {
    return activeEpics
      .filter((e) => (statusFilter === 'ALL' ? true : e.status === statusFilter))
      .filter((e) => (teamFilter === 'ALL' ? true : e.teamId === teamFilter))
      .filter((e) => (componentFilter === 'ALL' ? true : e.component === componentFilter))
      .filter((e) => (budgetFilter === 'ALL' ? true : e.budget === budgetFilter));
  }, [activeEpics, statusFilter, teamFilter, componentFilter, budgetFilter]);

  const groupCards = useMemo<GroupCard[]>(() => {
    const groups = groupEpics(filteredEpics, groupBy === 'none' ? 'demandDriver' : groupBy, users, teams);
    return groups.map((g) => {
      const scored = g.epics.filter((e) => e.matrixValue != null && e.matrixEffort != null);
      // Require a majority of the group to be classified before placing it in
      // a quadrant — a couple of manually-scored epics shouldn't drag an
      // otherwise-unclassified group of 40 into a specific box.
      if (scored.length === 0 || scored.length < g.epics.length / 2) {
        return { key: g.key, label: g.label, epics: g.epics, quadrant: null };
      }
      const avgValue = scored.reduce((s, e) => s + (e.matrixValue ?? 0), 0) / scored.length;
      const avgEffort = scored.reduce((s, e) => s + (e.matrixEffort ?? 0), 0) / scored.length;
      return { key: g.key, label: g.label, epics: g.epics, quadrant: classifyQuadrant(avgValue, avgEffort, MID, MID) };
    });
  }, [filteredEpics, groupBy, users, teams]);

  const unclassified = groupCards.filter((g) => g.quadrant === null);
  const byQuadrant = (q: Quadrant) => groupCards.filter((g) => g.quadrant === q);

  async function classify(groupKey: string, quadrant: Quadrant) {
    const group = groupCards.find((g) => g.key === groupKey);
    if (!group) return;
    setBusyKey(groupKey);
    try {
      const [matrixValue, matrixEffort] = TARGET_BY_QUADRANT[quadrant];
      await fetch('/api/epics/bulk-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicIds: group.epics.map((e) => e.id), matrixValue, matrixEffort }),
      });
      await refresh();
    } finally {
      setBusyKey(null);
      setDragKey(null);
    }
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (activeEpics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md px-8 py-10 text-center">
          <Database size={28} className="mx-auto text-muted" />
          <h2 className="mt-3 text-base font-semibold text-ink-800">No active epics to prioritize</h2>
          <p className="mt-1.5 text-sm text-muted">Import epics before you can prioritize them.</p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600">
            Go to Data Source <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">Prioritization Matrix</h1>
          <p className="text-sm text-muted">
            Drag a whole group onto a quadrant to classify every epic in it at once — Y = Value, X = Effort.
          </p>
        </div>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupByKey)}
          className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {GROUP_BY_OPTIONS.filter((o) => o.value !== 'none').map((o) => (
            <option key={o.value} value={o.value}>Group by: {o.label}</option>
          ))}
        </select>
      </div>

      <Card className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-xs font-medium text-muted">Filter:</span>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="ALL">All Status</option>
          {EPIC_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        {teams.length > 0 && (
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent">
            <option value="ALL">All Teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {components.length > 0 && (
          <select value={componentFilter} onChange={(e) => setComponentFilter(e.target.value)} className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent">
            <option value="ALL">All Components</option>
            {components.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {budgets.length > 0 && (
          <select value={budgetFilter} onChange={(e) => setBudgetFilter(e.target.value)} className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent">
            <option value="ALL">All Budgets</option>
            {budgets.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <span className="ml-auto text-xs text-muted">{filteredEpics.length} of {activeEpics.length} active epics</span>
      </Card>

      {unclassified.length > 0 && (
        <Card className="border-dashed">
          <CardHeader title="Unclassified" subtitle={`${unclassified.length} group(s) not yet placed — drag them into a quadrant below`} />
          <div className="flex flex-wrap gap-2 p-3">
            {unclassified.map((g) => (
              <GroupChip
                key={g.key}
                group={g}
                dragging={dragKey === g.key}
                busy={busyKey === g.key}
                expanded={expanded.has(g.key)}
                onDragStart={() => setDragKey(g.key)}
                onToggleExpand={() => toggleExpanded(g.key)}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['quick-wins', 'major-projects', 'fill-ins', 'avoid'] as Quadrant[]).map((q) => (
          <Card
            key={q}
            className={cn('min-h-[220px] border-2', QUADRANT_COLOR[q])}
            onDragOver={(e: React.DragEvent) => e.preventDefault()}
            onDrop={() => dragKey && classify(dragKey, q)}
          >
            <CardHeader title={QUADRANT_LABELS[q]} subtitle={`${QUADRANT_HINTS[q]} · ${byQuadrant(q).length} group(s)`} />
            <div className="flex flex-wrap gap-2 p-3">
              {byQuadrant(q).map((g) => (
                <GroupChip
                  key={g.key}
                  group={g}
                  dragging={dragKey === g.key}
                  busy={busyKey === g.key}
                  expanded={expanded.has(g.key)}
                  onDragStart={() => setDragKey(g.key)}
                  onToggleExpand={() => toggleExpanded(g.key)}
                />
              ))}
              {byQuadrant(q).length === 0 && <p className="py-6 text-center text-xs text-muted w-full">Drop a group here</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GroupChip({
  group, dragging, busy, expanded, onDragStart, onToggleExpand,
}: {
  group: GroupCard;
  dragging: boolean;
  busy: boolean;
  expanded: boolean;
  onDragStart: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div
      draggable={!busy}
      onDragStart={onDragStart}
      className={cn(
        'w-full rounded border border-line bg-surface px-3 py-2 text-xs shadow-card sm:w-[calc(50%-4px)]',
        dragging && 'opacity-50',
        busy ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'
      )}
    >
      <button onClick={onToggleExpand} className="flex w-full items-center justify-between text-left">
        <span className="font-medium text-ink-800">{group.label}</span>
        <span className="flex items-center gap-1 text-muted">
          {group.epics.length}
          {expanded ? <ChevronDown size={12} /> : <ChevronRightIcon size={12} />}
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-line pt-2">
          {group.epics.map((e) => (
            <li key={e.id}>
              <Link href={`/epics/${e.id}`} className="block truncate text-ink-600 hover:text-accent-600" title={e.title}>
                {e.epicKey} — {e.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
