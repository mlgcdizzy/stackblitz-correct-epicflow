'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { findEpicById } from '@/lib/lookups';
import { EPIC_STATUSES, type Epic } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui';
import { ArrowLeft, Trash2 } from 'lucide-react';

const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

type FormState = {
  title: string;
  description: string;
  productArea: string;
  component: string;
  fixVersion: string;
  budget: string;
  demandDriver: string;
  compPoints: string;
  numSprints: string;
  status: string;
  riskLevel: string;
  ownerId: string;
  teamId: string;
  targetQuarter: string;
  targetYear: string;
  storyPoints: string;
  tShirtSize: string;
  expectedDurationWeeks: string;
  tags: string;
  notes: string;
  reach: string; impact: string; confidence: string; effort: string;
  businessValue: string; timeCriticality: string; riskReduction: string; jobSize: string;
  revenueImpact: string; customerImpact: string; strategicAlignment: string; competitivePressure: string;
  riskScore: string; engineeringComplexity: string;
};

function epicToForm(e: Epic): FormState {
  const n = (v: number | undefined) => (v == null ? '' : String(v));
  return {
    title: e.title, description: e.description ?? '', productArea: e.productArea,
    component: e.component ?? '', fixVersion: e.fixVersion ?? '', status: e.status, riskLevel: e.riskLevel,
    budget: e.budget ?? '', demandDriver: e.demandDriver ?? '', compPoints: n(e.compPoints), numSprints: n(e.numSprints),
    ownerId: e.ownerId ?? '', teamId: e.teamId ?? '', targetQuarter: e.targetQuarter ?? '',
    targetYear: n(e.targetYear), storyPoints: n(e.storyPoints), tShirtSize: e.tShirtSize ?? '',
    expectedDurationWeeks: n(e.expectedDurationWeeks), tags: e.tags.join(', '), notes: e.notes ?? '',
    reach: n(e.reach), impact: n(e.impact), confidence: n(e.confidence), effort: n(e.effort),
    businessValue: n(e.businessValue), timeCriticality: n(e.timeCriticality), riskReduction: n(e.riskReduction), jobSize: n(e.jobSize),
    revenueImpact: n(e.revenueImpact), customerImpact: n(e.customerImpact), strategicAlignment: n(e.strategicAlignment),
    competitivePressure: n(e.competitivePressure), riskScore: n(e.riskScore), engineeringComplexity: n(e.engineeringComplexity),
  };
}

export default function EditEpicPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { epics, users, teams, loading, refresh } = usePortfolio();
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const epic = findEpicById(epics, params.id);

  useEffect(() => {
    if (epic && !form) setForm(epicToForm(epic));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epic]);

  if (loading || !form) return <div className="p-6 text-sm text-muted">Loading…</div>;

  if (!epic) {
    return (
      <div className="p-6">
        <Link href="/epics" className="flex items-center gap-1 text-sm text-muted hover:text-ink-700">
          <ArrowLeft size={14} /> Back to Epics
        </Link>
        <p className="mt-4 text-sm text-muted">This epic wasn't found.</p>
      </div>
    );
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function num(v: string): number | undefined {
    if (v.trim() === '') return undefined;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }

  async function handleDelete() {
    if (!confirm(`Delete "${epic.title}" (${epic.epicKey})? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/epics/${epic.id}`, { method: 'DELETE' });
      await refresh();
      router.push('/epics');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form!.title.trim() || !form!.productArea.trim()) {
      setError('Title and Product Area are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: form!.title,
        description: form!.description,
        productArea: form!.productArea,
        component: form!.component || undefined,
        fixVersion: form!.fixVersion || undefined,
        budget: form!.budget || undefined,
        demandDriver: form!.demandDriver || undefined,
        compPoints: num(form!.compPoints),
        numSprints: num(form!.numSprints),
        status: form!.status,
        riskLevel: form!.riskLevel,
        ownerId: form!.ownerId || undefined,
        teamId: form!.teamId || undefined,
        targetQuarter: form!.targetQuarter || undefined,
        targetYear: num(form!.targetYear),
        storyPoints: num(form!.storyPoints),
        tShirtSize: form!.tShirtSize || undefined,
        expectedDurationWeeks: num(form!.expectedDurationWeeks),
        tags: form!.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: form!.notes || undefined,
        reach: num(form!.reach), impact: num(form!.impact), confidence: num(form!.confidence), effort: num(form!.effort),
        businessValue: num(form!.businessValue), timeCriticality: num(form!.timeCriticality),
        riskReduction: num(form!.riskReduction), jobSize: num(form!.jobSize),
        revenueImpact: num(form!.revenueImpact), customerImpact: num(form!.customerImpact),
        strategicAlignment: num(form!.strategicAlignment), competitivePressure: num(form!.competitivePressure),
        riskScore: num(form!.riskScore), engineeringComplexity: num(form!.engineeringComplexity),
      };

      const res = await fetch(`/api/epics/${epic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'Could not save changes.');
        return;
      }
      await refresh();
      router.push(`/epics/${epic.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href={`/epics/${epic.id}`} className="flex items-center gap-1 text-sm text-muted hover:text-ink-700">
        <ArrowLeft size={14} /> Back to {epic.epicKey}
      </Link>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded border border-health-red/30 bg-health-red/5 px-3 py-2 text-sm text-health-red">{error}</p>}

        <Card>
          <CardHeader title="Details" />
          <div className="space-y-4 p-5">
            <Field label="Title" required>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Product Area" required>
                <input value={form.productArea} onChange={(e) => set('productArea', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Component / Group">
                <input value={form.component} onChange={(e) => set('component', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                  {EPIC_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Risk Level">
                <select value={form.riskLevel} onChange={(e) => set('riskLevel', e.target.value)} className={inputClass}>
                  {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Owner">
                <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)} className={inputClass}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Team">
                <select value={form.teamId} onChange={(e) => set('teamId', e.target.value)} className={inputClass}>
                  <option value="">Unassigned</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Target Quarter">
                <select value={form.targetQuarter} onChange={(e) => set('targetQuarter', e.target.value)} className={inputClass}>
                  <option value="">Unscheduled</option>
                  {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </Field>
              <Field label="Target Year">
                <input type="number" value={form.targetYear} onChange={(e) => set('targetYear', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Fix Version">
                <input value={form.fixVersion} onChange={(e) => set('fixVersion', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Budget">
                <input value={form.budget} onChange={(e) => set('budget', e.target.value)} className={inputClass} placeholder="e.g. BAU, Investment" />
              </Field>
              <Field label="Demand Driver">
                <input value={form.demandDriver} onChange={(e) => set('demandDriver', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Comp Pts">
                <input type="number" value={form.compPoints} onChange={(e) => set('compPoints', e.target.value)} className={inputClass} />
              </Field>
              <Field label="# Sprints">
                <input type="number" value={form.numSprints} onChange={(e) => set('numSprints', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Story Points">
                <input type="number" value={form.storyPoints} onChange={(e) => set('storyPoints', e.target.value)} className={inputClass} />
              </Field>
              <Field label="T-Shirt Size">
                <select value={form.tShirtSize} onChange={(e) => set('tShirtSize', e.target.value)} className={inputClass}>
                  <option value="">—</option>
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Duration (weeks)">
                <input type="number" value={form.expectedDurationWeeks} onChange={(e) => set('expectedDurationWeeks', e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Tags (comma separated)">
              <input value={form.tags} onChange={(e) => set('tags', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Prioritization inputs" subtitle="Fill in a full row to see that model's score on the epic page" />
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-3">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">RICE</p>
              <NumField label="Reach" value={form.reach} onChange={(v) => set('reach', v)} />
              <NumField label="Impact" value={form.impact} onChange={(v) => set('impact', v)} />
              <NumField label="Confidence (0-1)" value={form.confidence} onChange={(v) => set('confidence', v)} />
              <NumField label="Effort" value={form.effort} onChange={(v) => set('effort', v)} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">WSJF</p>
              <NumField label="Business Value" value={form.businessValue} onChange={(v) => set('businessValue', v)} />
              <NumField label="Time Criticality" value={form.timeCriticality} onChange={(v) => set('timeCriticality', v)} />
              <NumField label="Risk Reduction" value={form.riskReduction} onChange={(v) => set('riskReduction', v)} />
              <NumField label="Job Size" value={form.jobSize} onChange={(v) => set('jobSize', v)} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Product Value Score</p>
              <NumField label="Revenue Impact (1-5)" value={form.revenueImpact} onChange={(v) => set('revenueImpact', v)} />
              <NumField label="Customer Impact (1-5)" value={form.customerImpact} onChange={(v) => set('customerImpact', v)} />
              <NumField label="Strategic Alignment (1-5)" value={form.strategicAlignment} onChange={(v) => set('strategicAlignment', v)} />
              <NumField label="Competitive Pressure (1-5)" value={form.competitivePressure} onChange={(v) => set('competitivePressure', v)} />
              <NumField label="Risk Score (1-5)" value={form.riskScore} onChange={(v) => set('riskScore', v)} />
              <NumField label="Eng. Complexity (1-5)" value={form.engineeringComplexity} onChange={(v) => set('engineeringComplexity', v)} />
            </div>
          </div>
        </Card>

        <div className="flex justify-between gap-2 pb-6">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded border border-line px-4 py-2 text-sm text-muted hover:border-health-red hover:text-health-red disabled:opacity-50"
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting…' : 'Delete Epic'}
          </button>
          <div className="flex gap-2">
            <Link href={`/epics/${epic.id}`} className="rounded border border-line px-4 py-2 text-sm text-ink-700 hover:bg-field">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
        </div>
      </form>
    </div>
  );
}

const inputClass = 'w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label} {required && <span className="text-health-red">*</span>}
      </span>
      {children}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}
