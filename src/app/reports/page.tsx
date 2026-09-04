'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { findOwnerName } from '@/lib/lookups';
import { scoreCustom } from '@/lib/prioritization';
import { capacityUtilizationByTeam, strategicAlignmentByPillar } from '@/lib/aggregations';
import { Card, CardHeader, StatusBadge, RiskBadge } from '@/components/ui';
import { formatNumber, cn } from '@/lib/utils';
import { FileSpreadsheet, FileText, Presentation, Database, ArrowRight } from 'lucide-react';

export default function ReportsPage() {
  const { epics, teams, pillars, users, dependencies, loading } = usePortfolio();
  const [tab, setTab] = useState<'executive' | 'planning'>('executive');

  if (loading) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (epics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md px-8 py-10 text-center">
          <Database size={28} className="mx-auto text-muted" />
          <h2 className="mt-3 text-base font-semibold text-ink-800">No epics yet</h2>
          <p className="mt-1.5 text-sm text-muted">Import epics before generating reports.</p>
          <Link href="/settings" className="mt-4 inline-flex items-center gap-1.5 rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600">
            Go to Data Source <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    );
  }

  // Ranked by your manually-set priority order first (the one you control
  // from the Epics page) — falling back to Product Value Score for any
  // epic that hasn't been manually ranked yet.
  const top20 = [...epics]
    .map((e) => ({ epic: e, score: scoreCustom(e) ?? 0 }))
    .sort((a, b) => {
      const ar = a.epic.priorityRank;
      const br = b.epic.priorityRank;
      if (ar != null && br != null) return ar - br;
      if (ar != null) return -1;
      if (br != null) return 1;
      return b.score - a.score;
    })
    .slice(0, 20);

  const alignment = strategicAlignmentByPillar(epics, pillars);
  const capacity = capacityUtilizationByTeam(epics, teams);
  const risks = epics.filter((e) => e.riskLevel === 'HIGH' || e.riskLevel === 'CRITICAL');
  const openDependencies = dependencies.filter((d) => d.status === 'OPEN' || d.status === 'AT_RISK' || d.status === 'BLOCKED');

  async function exportFile(kind: 'excel' | 'pdf' | 'pptx') {
    const res = await fetch(`/api/reports/${kind}?type=${tab}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epicflow-${tab}-report.${kind === 'excel' ? 'xlsx' : kind}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">Reports</h1>
          <p className="text-sm text-muted">Export-ready views for planning and executive reviews</p>
        </div>
        <div className="flex gap-2">
          <ExportButton icon={FileSpreadsheet} label="Excel" onClick={() => exportFile('excel')} />
          <ExportButton icon={FileText} label="PDF" onClick={() => exportFile('pdf')} />
          <ExportButton icon={Presentation} label="PowerPoint" onClick={() => exportFile('pptx')} />
        </div>
      </div>

      <div className="flex rounded border border-line bg-surface p-0.5 text-sm w-fit">
        {(['executive', 'planning'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('rounded px-4 py-1.5 capitalize', tab === t ? 'bg-ink text-white' : 'text-muted')}
          >
            {t} Report
          </button>
        ))}
      </div>

      {tab === 'executive' ? (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader title="Top 20 Epics" subtitle="Your manual priority order, with Product Value Score for anything not yet ranked" />
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-field text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Rank</th>
                  <th className="px-4 py-2 font-medium">Epic</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {top20.map(({ epic, score }, i) => (
                  <tr key={epic.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-mono text-muted">{i + 1}</td>
                    <td className="px-4 py-2">
                      <Link href={`/epics/${epic.id}`} className="text-ink-800 hover:text-accent-600">{epic.title}</Link>
                    </td>
                    <td className="px-4 py-2 text-ink-700">{findOwnerName(users, epic.ownerId)}</td>
                    <td className="px-4 py-2"><StatusBadge status={epic.status} /></td>
                    <td className="px-4 py-2 font-mono text-ink-700">{formatNumber(score, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {pillars.length > 0 && (
            <Card>
              <CardHeader title="Strategic Coverage" subtitle="Alignment score and epic count per pillar" />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                {alignment.map((a) => (
                  <div key={a.pillar} className="rounded border border-line p-3 text-center">
                    <p className="font-mono text-xl font-semibold text-ink-800">{a.score}</p>
                    <p className="text-xs text-muted">{a.pillar}</p>
                    <p className="mt-1 text-[11px] text-muted">{a.epicCount} epics</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Risks" subtitle={`${risks.length} epics flagged High or Critical`} />
            <div className="divide-y divide-line">
              {risks.length === 0 && <p className="px-5 py-4 text-sm text-muted">No high or critical risk epics.</p>}
              {risks.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-2.5">
                  <Link href={`/epics/${e.id}`} className="text-sm text-ink-800 hover:text-accent-600">{e.title}</Link>
                  <RiskBadge risk={e.riskLevel} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.length > 0 && (
            <Card>
              <CardHeader title="Capacity Analysis" subtitle="Utilization by team" />
              <div className="divide-y divide-line">
                {capacity.map((c) => (
                  <div key={c.team} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span className="text-ink-800">{c.team}</span>
                    <span className="font-mono text-ink-700">{c.committedLoad} / {c.capacity} pts ({c.utilization}%)</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader title="Prioritization Outputs" subtitle="Product Value Score by epic" />
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-field text-left text-xs uppercase text-muted">
                <tr><th className="px-4 py-2 font-medium">Epic</th><th className="px-4 py-2 font-medium">Score</th></tr>
              </thead>
              <tbody>
                {top20.slice(0, 10).map(({ epic, score }) => (
                  <tr key={epic.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink-800">{epic.title}</td>
                    <td className="px-4 py-2 font-mono text-ink-700">{formatNumber(score, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader title="Dependencies" subtitle={`${openDependencies.length} open, at-risk, or blocked`} />
            <div className="divide-y divide-line">
              {openDependencies.length === 0 && <p className="px-5 py-4 text-sm text-muted">No open dependencies.</p>}
              {openDependencies.map((d) => (
                <div key={d.id} className="px-5 py-2.5 text-sm text-ink-700">{d.notes}</div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ExportButton({ icon: Icon, label, onClick }: { icon: typeof FileSpreadsheet; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink-700 hover:bg-field"
    >
      <Icon size={14} /> {label}
    </button>
  );
}
