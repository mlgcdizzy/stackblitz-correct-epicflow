'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePortfolio } from '@/lib/use-portfolio';
import { useJiraConnection } from '@/lib/use-jira-connection';
import { suggestGroupForTitle } from '@/lib/classification';
import { EPIC_STATUSES } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui';
import { ArrowLeft, Sparkles, ExternalLink } from 'lucide-react';

const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function NewEpicPage() {
  const router = useRouter();
  const { users, teams, epics } = usePortfolio();
  const jira = useJiraConnection();

  const [form, setForm] = useState({
    title: '',
    productArea: '',
    component: '',
    description: '',
    status: 'IDEA',
    ownerId: '',
    teamId: '',
    targetQuarter: '',
    targetYear: new Date().getFullYear(),
    riskLevel: 'MEDIUM',
  });
  const [componentTouched, setComponentTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedComponent = form.title.trim().length > 3 ? suggestGroupForTitle(form.title, epics) : null;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleTitleChange(title: string) {
    set('title', title);
    // Keep auto-filling the suggestion as they type, right up until they
    // deliberately edit the Component field themselves.
    if (!componentTouched) {
      const suggestion = title.trim().length > 3 ? suggestGroupForTitle(title, epics) : null;
      if (suggestion) set('component', suggestion);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.productArea.trim()) {
      setError('Title and Product Area are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/epics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ownerId: form.ownerId || undefined,
          teamId: form.teamId || undefined,
          targetQuarter: form.targetQuarter || undefined,
          component: form.component.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not create epic.');
        return;
      }
      router.push(`/epics/${json.epic.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create epic.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Link href="/epics" className="flex items-center gap-1 text-sm text-muted hover:text-ink-700">
        <ArrowLeft size={14} /> Back to Epics
      </Link>

      <Card>
        <CardHeader title="New Epic" subtitle="You can add prioritization scores and more detail later from the epic's page" />
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && <p className="rounded border border-health-red/30 bg-health-red/5 px-3 py-2 text-sm text-health-red">{error}</p>}

          {jira.connected && jira.baseUrl && jira.projectKey && (
            <a
              href={`${jira.baseUrl.replace(/\/$/, '')}/jira/software/c/projects/${jira.projectKey}/issues/create`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded border border-line bg-field px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
            >
              <span>Prefer to create this directly in Jira instead?</span>
              <span className="flex items-center gap-1 font-medium text-accent-600">
                Create in Jira <ExternalLink size={12} />
              </span>
            </a>
          )}

          <Field label="Title" required>
            <input
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="e.g. Self-serve API key management"
              autoFocus
            />
          </Field>

          <Field label="Product Area" required>
            <input
              value={form.productArea}
              onChange={(e) => set('productArea', e.target.value)}
              className="w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="e.g. Platform, Payments, FraudAPI…"
            />
          </Field>

          <Field label="Component / Group">
            <input
              value={form.component}
              onChange={(e) => { setComponentTouched(true); set('component', e.target.value); }}
              className="w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Used for grouping on the Epics and Matrix pages"
            />
            {suggestedComponent && form.component === suggestedComponent && !componentTouched && (
              <p className="mt-1 flex items-center gap-1 text-xs text-accent-600">
                <Sparkles size={11} /> Suggested based on similar existing epics — edit if this isn't right.
              </p>
            )}
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className="w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="w-full rounded border border-line bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {EPIC_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </Field>

            <Field label="Risk Level">
              <select
                value={form.riskLevel}
                onChange={(e) => set('riskLevel', e.target.value)}
                className="w-full rounded border border-line bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {RISKS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>

            <Field label="Owner">
              <select
                value={form.ownerId}
                onChange={(e) => set('ownerId', e.target.value)}
                className="w-full rounded border border-line bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Team">
              <select
                value={form.teamId}
                onChange={(e) => set('teamId', e.target.value)}
                className="w-full rounded border border-line bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Unassigned</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Target Quarter">
              <select
                value={form.targetQuarter}
                onChange={(e) => set('targetQuarter', e.target.value)}
                className="w-full rounded border border-line bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Unscheduled</option>
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </Field>

            <Field label="Target Year">
              <input
                type="number"
                value={form.targetYear}
                onChange={(e) => set('targetYear', parseInt(e.target.value, 10))}
                className="w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/epics" className="rounded border border-line px-4 py-2 text-sm text-ink-700 hover:bg-field">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-600 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Epic'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

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
