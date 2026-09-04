'use client';

import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { strategicAlignmentByPillar } from '@/lib/aggregations';
import { Card, CardHeader, ProgressBar } from '@/components/ui';
import { format } from 'date-fns';
import { Database, ArrowRight } from 'lucide-react';

export default function StrategyPage() {
  const { epics, pillars, objectives, loading } = usePortfolio();

  if (loading) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (pillars.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md px-8 py-10 text-center">
          <Database size={28} className="mx-auto text-muted" />
          <h2 className="mt-3 text-base font-semibold text-ink-800">No strategic pillars defined yet</h2>
          <p className="mt-1.5 text-sm text-muted">
            Pillars, objectives, and OKRs aren't part of a standard Jira/Excel epic import — load the sample data to
            see how this page works, or add pillars for your organization via the data file.
          </p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600">
            Go to Data Source <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    );
  }

  const alignment = strategicAlignmentByPillar(epics, pillars);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-800">Strategy</h1>
        <p className="text-sm text-muted">Strategic pillars, objectives, and portfolio coverage</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pillars.map((pillar) => {
          const linkedObjectives = objectives.filter((o) => o.pillarId === pillar.id);
          const pillarAlignment = alignment.find((a) => a.pillar === pillar.name);
          const pillarEpics = epics.filter((e) => e.pillarId === pillar.id);

          return (
            <Card key={pillar.id}>
              <CardHeader
                title={pillar.name}
                subtitle={`${pillarEpics.length} linked epics`}
                action={
                  <span className="font-mono text-sm font-semibold text-ink-700">
                    {pillarAlignment?.score ?? '—'}<span className="text-xs text-muted">/5</span>
                  </span>
                }
              />
              <div className="space-y-3 p-5">
                <ProgressBar value={pillarAlignment?.score ?? 0} max={5} colorClass="bg-ink-500" />
                <div className="space-y-2">
                  {linkedObjectives.map((o) => (
                    <div key={o.id} className="rounded border border-line px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-ink-800">{o.title}</p>
                        <span className="text-xs text-muted">{o.executiveOwner}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{o.description}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {format(new Date(o.startDate), 'MMM yyyy')} – {format(new Date(o.endDate), 'MMM yyyy')} · weight {o.weight}
                      </p>
                    </div>
                  ))}
                  {linkedObjectives.length === 0 && (
                    <p className="text-xs text-muted">No objectives linked to this pillar yet.</p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
