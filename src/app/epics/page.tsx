'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { findOwnerName } from '@/lib/lookups';
import { groupEpics, suggestGroupsForUnclassified, GROUP_BY_OPTIONS, type GroupByKey } from '@/lib/classification';
import { EPIC_STATUSES, type Epic } from '@/lib/types';
import { scoreRICE } from '@/lib/prioritization';
import { Card, StatusBadge, RiskBadge } from '@/components/ui';
import { EditableField } from '@/components/editable-field';
import { formatNumber } from '@/lib/utils';
import { Database, ArrowRight, GripVertical, Trash2, Sparkles, Check, X, ArrowUpDown } from 'lucide-react';

const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Sorts a set of epics by their saved priorityRank; epics with no rank yet fall to the end, ordered by RICE score as a reasonable default. */
function byPriorityRank(list: Epic[]): Epic[] {
  return [...list].sort((a, b) => {
    const ar = a.priorityRank;
    const br = b.priorityRank;
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    return (scoreRICE(b) ?? -1) - (scoreRICE(a) ?? -1);
  });
}

export default function EpicsPage() {
  const { epics, teams, pillars, users, loading, refresh } = usePortfolio();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [area, setArea] = useState('ALL');
  const [quarter, setQuarter] = useState('ALL');
  const [pillar, setPillar] = useState('ALL');
  const [team, setTeam] = useState('ALL');
  const [risk, setRisk] = useState('ALL');
  const [budgetFilter, setBudgetFilter] = useState('ALL');
  const [demandDriverFilter, setDemandDriverFilter] = useState('ALL');
  const [groupBy, setGroupBy] = useState<GroupByKey>('none');
  const [order, setOrder] = useState<Epic[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Epic | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [applyingSuggestion, setApplyingSuggestion] = useState<string | null>(null);
  const [reranking, setReranking] = useState(false);

  // The single, canonical priority order — always initialized from each
  // epic's saved priorityRank (falling back to RICE score for anything
  // never ranked yet). Only re-derived when the underlying epics data
  // actually changes (e.g. after a refresh), never overwritten mid-drag.
  useEffect(() => {
    setOrder(byPriorityRank(epics));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epics]);

  const areas = useMemo(() => Array.from(new Set(epics.map((e) => e.productArea))), [epics]);
  const budgets = useMemo(() => Array.from(new Set(epics.map((e) => e.budget).filter(Boolean))) as string[], [epics]);
  const demandDrivers = useMemo(() => Array.from(new Set(epics.map((e) => e.demandDriver).filter(Boolean))) as string[], [epics]);

  const filtersActive =
    search.trim() !== '' || status !== 'ALL' || area !== 'ALL' || quarter !== 'ALL' || pillar !== 'ALL' ||
    team !== 'ALL' || risk !== 'ALL' || budgetFilter !== 'ALL' || demandDriverFilter !== 'ALL';

  const matches = (e: Epic) =>
    (status === 'ALL' || e.status === status) &&
    (area === 'ALL' || e.productArea === area) &&
    (quarter === 'ALL' || e.targetQuarter === quarter) &&
    (pillar === 'ALL' || e.pillarId === pillar) &&
    (team === 'ALL' || e.teamId === team) &&
    (risk === 'ALL' || e.riskLevel === risk) &&
    (budgetFilter === 'ALL' || e.budget === budgetFilter) &&
    (demandDriverFilter === 'ALL' || e.demandDriver === demandDriverFilter) &&
    (search.trim() === '' || `${e.epicKey} ${e.title}`.toLowerCase().includes(search.toLowerCase()));

  const orderedAll = order ?? byPriorityRank(epics);
  const globalRankById = useMemo(() => new Map(orderedAll.map((e, i) => [e.id, i + 1])), [orderedAll]);

  const filteredOrdered = useMemo(() => orderedAll.filter(matches), [orderedAll, status, area, quarter, pillar, team, risk, budgetFilter, demandDriverFilter, search]);
  const filteredRankById = useMemo(() => new Map(filteredOrdered.map((e, i) => [e.id, i + 1])), [filteredOrdered]);

  const groups = useMemo(() => groupEpics(filteredOrdered, groupBy, users, teams), [filteredOrdered, groupBy, users, teams]);

  const suggestions = useMemo(
    () => suggestGroupsForUnclassified(epics).filter((s) => !dismissedSuggestions.has(s.epicId)),
    [epics, dismissedSuggestions]
  );
  const epicById = useMemo(() => new Map(epics.map((e) => [e.id, e])), [epics]);

  const [saveError, setSaveError] = useState<string | null>(null);

  async function persistOrder(next: Epic[]) {
    const previous = orderedAll;
    setOrder(next);
    setSaveError(null);
    try {
      const res = await fetch('/api/epics/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: next.map((e) => e.id) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setOrder(previous); // roll back the optimistic change — it didn't actually save
        setSaveError(json.error ?? 'Could not save the new priority order. Your change was not kept — please try again.');
      }
    } catch (err) {
      setOrder(previous);
      setSaveError(err instanceof Error ? err.message : 'Could not save the new priority order. Your change was not kept — please try again.');
    }
  }

  function handleDropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const current = orderedAll;
    const from = current.findIndex((e) => e.id === dragId);
    const to = current.findIndex((e) => e.id === targetId);
    if (from === -1 || to === -1) return;

    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(next);
  }

  /** Moves one epic directly to a typed rank position (1-indexed) — much faster than dragging across a long list. */
  function jumpToRank(epicId: string, newRank: number) {
    const current = orderedAll;
    const from = current.findIndex((e) => e.id === epicId);
    if (from === -1) return;

    const clamped = Math.max(1, Math.min(current.length, Math.round(newRank))) - 1;
    if (clamped === from) return;

    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(clamped, 0, moved);
    persistOrder(next);
  }

  /** Re-ranks just the currently filtered/visible epics by RICE score, leaving everything outside the filter exactly where it was. */
  async function rerankFilteredByRice() {
    setReranking(true);
    try {
      const filteredIds = new Set(filteredOrdered.map((e) => e.id));
      const riceSorted = [...filteredOrdered].sort((a, b) => (scoreRICE(b) ?? -1) - (scoreRICE(a) ?? -1));
      let cursor = 0;
      const next = orderedAll.map((e) => (filteredIds.has(e.id) ? riceSorted[cursor++] : e));
      await persistOrder(next);
    } finally {
      setReranking(false);
    }
  }

  async function approveSuggestion(epicId: string, component: string) {
    setApplyingSuggestion(epicId);
    try {
      await fetch(`/api/epics/${epicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component }),
      });
      await refresh();
    } finally {
      setApplyingSuggestion(null);
    }
  }

  function dismissSuggestion(epicId: string) {
    setDismissedSuggestions((prev) => new Set(prev).add(epicId));
  }

  async function handleDelete(epic: Epic) {
    if (!confirm(`Delete "${epic.title}" (${epic.epicKey})? This cannot be undone.`)) return;
    setDeleting(epic.id);
    try {
      await fetch(`/api/epics/${epic.id}`, { method: 'DELETE' });
      await refresh();
      setLastDeleted(epic);
      setTimeout(() => setLastDeleted((cur) => (cur?.id === epic.id ? null : cur)), 8000);
    } finally {
      setDeleting(null);
    }
  }

  async function undoDelete() {
    if (!lastDeleted) return;
    const restored = lastDeleted;
    setLastDeleted(null);
    await fetch('/api/epics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(restored),
    });
    await refresh();
  }

  if (loading || order === null) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (epics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md px-8 py-10 text-center">
          <Database size={28} className="mx-auto text-muted" />
          <h2 className="mt-3 text-base font-semibold text-ink-800">No epics yet</h2>
          <p className="mt-1.5 text-sm text-muted">Import from Jira or upload a spreadsheet to get started.</p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600">
            Go to Data Source <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">Epics</h1>
          <p className="text-sm text-muted">{filteredOrdered.length} of {epics.length} epics</p>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-2 px-4 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by key or title…"
          className="w-56 rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Select label="Status" value={status} onChange={setStatus} options={['ALL', ...EPIC_STATUSES]} />
        <Select label="Area" value={area} onChange={setArea} options={['ALL', ...areas]} />
        <Select label="Quarter" value={quarter} onChange={setQuarter} options={['ALL', ...QUARTERS]} />
        {pillars.length > 0 && (
          <Select label="Pillar" value={pillar} onChange={setPillar} options={['ALL', ...pillars.map((p) => p.id)]} labels={{ ALL: 'All Pillars', ...Object.fromEntries(pillars.map((p) => [p.id, p.name])) }} />
        )}
        {teams.length > 0 && (
          <Select label="Team" value={team} onChange={setTeam} options={['ALL', ...teams.map((t) => t.id)]} labels={{ ALL: 'All Teams', ...Object.fromEntries(teams.map((t) => [t.id, t.name])) }} />
        )}
        <Select label="Risk" value={risk} onChange={setRisk} options={['ALL', ...RISKS]} />
        {budgets.length > 0 && <Select label="Budget" value={budgetFilter} onChange={setBudgetFilter} options={['ALL', ...budgets]} />}
        {demandDrivers.length > 0 && <Select label="Demand Driver" value={demandDriverFilter} onChange={setDemandDriverFilter} options={['ALL', ...demandDrivers]} />}

        <span className="ml-auto" />

        <Select
          label="Group by"
          value={groupBy}
          onChange={(v) => setGroupBy(v as GroupByKey)}
          options={GROUP_BY_OPTIONS.map((o) => o.value)}
          labels={Object.fromEntries(GROUP_BY_OPTIONS.map((o) => [o.value, o.value === 'none' ? 'No grouping' : `Group: ${o.label}`]))}
        />
        <button
          onClick={rerankFilteredByRice}
          disabled={reranking}
          className="flex items-center gap-1 rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 hover:bg-field disabled:opacity-50"
          title={filtersActive ? 'Re-rank just the filtered epics by RICE score' : 'Re-rank all epics by RICE score'}
        >
          <ArrowUpDown size={12} /> {reranking ? 'Re-ranking…' : `Re-rank by RICE${filtersActive ? ' (filtered)' : ''}`}
        </button>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <GripVertical size={12} /> Drag any row by its handle to set priority — saved instantly and used everywhere
        priority order matters. {filtersActive && 'Dragging within a filtered view still sets the correct position in the overall priority order.'}
      </p>

      {saveError && (
        <Card className="border-health-red/30 bg-health-red/5 px-4 py-2.5 text-sm text-health-red">
          {saveError}
        </Card>
      )}

      {lastDeleted && (
        <Card className="flex items-center justify-between border-line bg-field px-4 py-2.5 text-sm text-ink-700">
          <span>Deleted &ldquo;{lastDeleted.title}&rdquo; ({lastDeleted.epicKey}).</span>
          <button onClick={undoDelete} className="font-medium text-accent-600 hover:underline">
            Undo
          </button>
        </Card>
      )}

      {suggestions.length > 0 && (
        <Card className="border-accent-100 bg-accent-50/40">
          <div className="flex items-center justify-between border-b border-accent-100 px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
              <Sparkles size={14} className="text-accent-600" /> Suggested classifications
            </span>
            <span className="text-xs text-muted">
              {suggestions.length} unclassified epic{suggestions.length === 1 ? '' : 's'} with a likely Component match
            </span>
          </div>
          <div className="divide-y divide-line">
            {suggestions.slice(0, 8).map((s) => {
              const epic = epicById.get(s.epicId);
              if (!epic) return null;
              return (
                <div key={s.epicId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/epics/${epic.id}`} className="truncate font-medium text-ink-800 hover:text-accent-600">
                      {epic.title}
                    </Link>
                    <p className="text-xs text-muted">
                      Suggested: <span className="font-medium text-ink-700">{s.suggestedComponent}</span>
                      {' · '}{s.confidence} confidence, matched on &ldquo;{s.matchedOn}&rdquo;
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => approveSuggestion(s.epicId, s.suggestedComponent)}
                      disabled={applyingSuggestion === s.epicId}
                      className="flex items-center gap-1 rounded bg-ink px-2.5 py-1 text-xs font-medium text-white hover:bg-ink-600 disabled:opacity-50"
                    >
                      <Check size={12} /> Approve
                    </button>
                    <button
                      onClick={() => dismissSuggestion(s.epicId)}
                      className="flex items-center gap-1 rounded border border-line px-2.5 py-1 text-xs text-muted hover:bg-field"
                    >
                      <X size={12} /> Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {suggestions.length > 8 && (
            <p className="border-t border-accent-100 px-4 py-2 text-xs text-muted">
              +{suggestions.length - 8} more — approve some of these first, then refresh to see the rest.
            </p>
          )}
        </Card>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group.key} className="overflow-hidden">
            {groupBy !== 'none' && (
              <div className="flex items-center justify-between border-b border-line bg-field px-4 py-2">
                <span className="text-sm font-semibold text-ink-800">{group.label}</span>
                <span className="text-xs text-muted">{group.epics.length} epic{group.epics.length === 1 ? '' : 's'}</span>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-field text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="px-4 py-2.5 font-medium">Priority</th>
                  {filtersActive && <th className="px-4 py-2.5 font-medium">In Filter</th>}
                  <th className="px-4 py-2.5 font-medium">Key</th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Component</th>
                  <th className="px-4 py-2.5 font-medium">Budget</th>
                  <th className="px-4 py-2.5 font-medium">Comp Pts</th>
                  <th className="px-4 py-2.5 font-medium"># Sprints</th>
                  <th className="px-4 py-2.5 font-medium">Quarter</th>
                  <th className="px-4 py-2.5 font-medium">RICE</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {group.epics.map((e) => (
                  <tr
                    key={e.id}
                    draggable
                    onDragStart={() => setDragId(e.id)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => handleDropOn(e.id)}
                    className={`border-b border-line last:border-0 hover:bg-field ${dragId === e.id ? 'opacity-50' : ''}`}
                  >
                    <td className="cursor-grab px-2 py-2.5 text-muted active:cursor-grabbing">
                      <GripVertical size={14} />
                    </td>
                    <td className="px-4 py-2.5">
                      <PriorityRankCell epic={e} rank={globalRankById.get(e.id) ?? 1} total={orderedAll.length} onSetRank={jumpToRank} />
                    </td>
                    {filtersActive && (
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">#{filteredRankById.get(e.id)}</td>
                    )}
                    <td className="px-4 py-2.5">
                      <Link href={`/epics/${e.id}`} className="font-mono text-xs text-ink-500 hover:underline">
                        {e.epicKey}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/epics/${e.id}`} className="font-medium text-ink-800 hover:text-accent-600">
                        {e.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-2.5 text-ink-700">{findOwnerName(users, e.ownerId)}</td>
                    <td className="px-4 py-2.5 text-ink-700"><EditableField epic={e} field="component" onSaved={refresh} /></td>
                    <td className="px-4 py-2.5 text-ink-700"><EditableField epic={e} field="budget" onSaved={refresh} /></td>
                    <td className="px-4 py-2.5 font-mono text-ink-700"><EditableField epic={e} field="compPoints" type="number" onSaved={refresh} /></td>
                    <td className="px-4 py-2.5 font-mono text-ink-700"><EditableField epic={e} field="numSprints" type="number" onSaved={refresh} /></td>
                    <td className="px-4 py-2.5 text-ink-700">{e.targetQuarter ?? '—'} {e.targetYear ?? ''}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-700">{formatNumber(scoreRICE(e))}</td>
                    <td className="px-4 py-2.5"><RiskBadge risk={e.riskLevel} /></td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => handleDelete(e)}
                        disabled={deleting === e.id}
                        className="text-muted hover:text-health-red disabled:opacity-50"
                        aria-label={`Delete ${e.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
        {groups.every((g) => g.epics.length === 0) && (
          <Card className="px-4 py-10 text-center text-sm text-muted">No epics match these filters. Try widening your search.</Card>
        )}
      </div>
    </div>
  );
}

function PriorityRankCell({
  epic, rank, total, onSetRank,
}: {
  epic: Epic;
  rank: number;
  total: number;
  onSetRank: (epicId: string, rank: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(rank));

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={total}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const n = parseInt(value, 10);
          if (Number.isFinite(n)) onSetRank(epic.id, n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setValue(String(rank)); setEditing(false); }
        }}
        className="w-14 rounded border border-accent-500 px-1.5 py-0.5 font-mono text-xs focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => { setValue(String(rank)); setEditing(true); }}
      className="font-mono text-xs text-ink-800 hover:text-accent-600"
      title="Click to type an exact priority position"
    >
      #{rank}
    </button>
  );
}

function Select({
  label, value, onChange, options, labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-700 focus:outline-none focus:ring-1 focus:ring-accent"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {labels?.[opt] ?? (opt === 'ALL' ? `All ${label}` : opt.replace('_', ' '))}
        </option>
      ))}
    </select>
  );
}
