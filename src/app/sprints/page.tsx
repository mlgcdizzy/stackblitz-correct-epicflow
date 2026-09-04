'use client';

import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { Card, CardHeader } from '@/components/ui';
import { Database, ArrowRight, CalendarDays } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { format } from 'date-fns';

export default function SprintSchedulePage() {
  const { sprints, epics, loading } = usePortfolio();

  if (loading) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (!sprints || sprints.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md px-8 py-10 text-center">
          <Database size={28} className="mx-auto text-muted" />
          <h2 className="mt-3 text-base font-semibold text-ink-800">No sprint schedule yet</h2>
          <p className="mt-1.5 text-sm text-muted">
            Upload a roadmap workbook with a sprint calendar sheet (columns: Sprint, Start, End) from the Data Source
            page to populate this.
          </p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600">
            Go to Data Source <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const sorted = [...sprints].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const byYear = new Map<number, typeof sorted>();
  for (const s of sorted) {
    if (!byYear.has(s.year)) byYear.set(s.year, []);
    byYear.get(s.year)!.push(s);
  }

  const epicsWithDevWindow = epics.filter((e) => e.devStart && e.devEnd);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-800">Sprint Schedule</h1>
        <p className="text-sm text-muted">
          {sorted.length} sprints across {byYear.size} year{byYear.size === 1 ? '' : 's'} · epics shown where their
          dev window overlaps the sprint
        </p>
      </div>

      {Array.from(byYear.entries()).map(([year, yearSprints]) => (
        <Card key={year} className="overflow-hidden">
          <CardHeader title={String(year)} subtitle={`${yearSprints.length} sprints`} />
          <div className="divide-y divide-line">
            {yearSprints.map((sprint) => {
              const start = new Date(sprint.startDate);
              const end = new Date(sprint.endDate);
              const isCurrent = now >= start && now <= end;

              const epicsInSprint = epicsWithDevWindow.filter((e) => {
                const devStart = new Date(e.devStart!);
                const devEnd = new Date(e.devEnd!);
                return devStart <= end && devEnd >= start;
              });
              const totalCompPts = epicsInSprint.reduce((sum, e) => sum + (e.compPoints ?? 0), 0);

              return (
                <div key={sprint.id} className={cn('px-5 py-3', isCurrent && 'bg-accent-50')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isCurrent && <CalendarDays size={14} className="text-accent-600" />}
                      <span className={cn('text-sm font-semibold', isCurrent ? 'text-accent-600' : 'text-ink-800')}>
                        Sprint {sprint.number}
                      </span>
                      {isCurrent && <span className="rounded bg-accent-500 px-1.5 py-0.5 text-[10px] font-medium text-white">CURRENT</span>}
                    </div>
                    <span className="text-xs text-muted">
                      {format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}
                    </span>
                  </div>
                  {epicsInSprint.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-muted">{epicsInSprint.length} epic(s) · {formatNumber(totalCompPts)} comp pts</p>
                      <div className="flex flex-wrap gap-1.5">
                        {epicsInSprint.map((e) => (
                          <Link
                            key={e.id}
                            href={`/epics/${e.id}`}
                            className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-ink-700 hover:border-accent-500 hover:text-accent-600"
                            title={e.title}
                          >
                            {e.epicKey}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">No epics with a dev window in this sprint.</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
