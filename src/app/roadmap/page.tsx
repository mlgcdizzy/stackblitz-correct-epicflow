'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { findTeamName } from '@/lib/lookups';
import { capacityUtilizationByTeam } from '@/lib/aggregations';
import { Card, CardHeader } from '@/components/ui';
import { AlertTriangle, GitBranch, Database, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Epic } from '@/lib/types';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function RoadmapPage() {
  const { epics, teams, dependencies, loading } = usePortfolio();
  const [view, setView] = useState<'quarterly' | 'monthly'>('quarterly');

  if (loading) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (epics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md px-8 py-10 text-center">
          <Database size={28} className="mx-auto text-muted" />
          <h2 className="mt-3 text-base font-semibold text-ink-800">No epics yet</h2>
          <p className="mt-1.5 text-sm text-muted">Import epics to build out the roadmap.</p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600">
            Go to Data Source <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    );
  }

  const utilization = capacityUtilizationByTeam(epics, teams);
  const overCommitted = utilization.filter((t) => t.status === 'over' || t.status === 'at-risk');
  const relevant = epics
    .filter((e) => ['PLANNED', 'COMMITTED', 'IN_PROGRESS', 'BLOCKED'].includes(e.status))
    .sort((a, b) => {
      if (a.priorityRank != null && b.priorityRank != null) return a.priorityRank - b.priorityRank;
      if (a.priorityRank != null) return -1;
      if (b.priorityRank != null) return 1;
      return 0;
    });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">Roadmap</h1>
          <p className="text-sm text-muted">Committed and in-flight epics across the planning year</p>
        </div>
        <div className="flex rounded border border-line bg-surface p-0.5 text-sm">
          {(['quarterly', 'monthly'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('rounded px-3 py-1 capitalize', view === v ? 'bg-ink text-white' : 'text-muted')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {overCommitted.length > 0 && (
        <Card className="flex items-start gap-2 border-health-amber/30 bg-health-amber/5 px-4 py-3 text-sm text-ink-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-health-amber" />
          <div>
            <p className="font-medium">Overcommitment alert</p>
            <p className="text-muted">
              {overCommitted.map((t) => t.team).join(', ')} {overCommitted.length === 1 ? 'is' : 'are'} running above
              healthy utilization this quarter. Review the Capacity page before locking commitments.
            </p>
          </div>
        </Card>
      )}

      {relevant.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-muted">
          No epics are currently Planned, Committed, In Progress, or Blocked — nothing to show on the roadmap yet.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title={view === 'quarterly' ? 'Quarterly view' : 'Monthly view'} subtitle="Grouped by target quarter" />
          <div className="grid grid-cols-[minmax(220px,1fr)_repeat(4,1fr)] border-t border-line text-xs">
            <div className="border-b border-r border-line bg-field px-3 py-2 font-medium text-muted">Epic</div>
            {QUARTERS.map((q) => (
              <div key={q} className="border-b border-r border-line bg-field px-3 py-2 text-center font-medium text-muted last:border-r-0">
                {q}
              </div>
            ))}

            {relevant.map((e) => {
              const hasBlockedDep = dependencies.some(
                (d) => (d.sourceEpicId === e.id || d.targetEpicId === e.id) && d.status === 'BLOCKED'
              );
              return <FragmentRow key={e.id} epic={e} teams={teams} quarters={QUARTERS} hasBlockedDep={hasBlockedDep} />;
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function FragmentRow({
  epic, teams, quarters, hasBlockedDep,
}: {
  epic: Epic;
  teams: ReturnType<typeof usePortfolio>['teams'];
  quarters: string[];
  hasBlockedDep: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-r border-line px-3 py-2">
        {hasBlockedDep && <GitBranch size={12} className="shrink-0 text-health-red" />}
        <Link href={`/epics/${epic.id}`} className="truncate text-ink-800 hover:text-accent-600" title={epic.title}>
          {epic.title}
        </Link>
      </div>
      {quarters.map((q) => (
        <div key={q} className="relative border-b border-r border-line px-2 py-2 last:border-r-0">
          {epic.targetQuarter === q && (
            <div
              className={cn(
                'flex h-6 items-center justify-center rounded text-[10px] font-medium text-white',
                epic.status === 'BLOCKED' ? 'bg-status-blocked' : epic.status === 'IN_PROGRESS' ? 'bg-status-progress' : 'bg-status-committed'
              )}
              title={`${findTeamName(teams, epic.teamId)} · ${epic.status}`}
            >
              {epic.epicKey}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
