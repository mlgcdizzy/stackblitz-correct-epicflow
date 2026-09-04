'use client';

import { useEffect, useRef, useState } from 'react';
import { usePortfolio } from '@/lib/use-portfolio';
import { Card, CardHeader } from '@/components/ui';
import { Download, Upload, Trash2, RefreshCw, CheckCircle2, AlertCircle, Database, User } from 'lucide-react';

type Notice = { type: 'success' | 'error'; message: string } | null;

const ROLES = ['ADMIN', 'PORTFOLIO_MANAGER', 'PRODUCT_MANAGER', 'READ_ONLY'];

export default function SettingsPage() {
  const { epics, loading, refresh } = usePortfolio();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const roadmapInputRef = useRef<HTMLInputElement>(null);
  const [roadmapResult, setRoadmapResult] = useState<{
    epicsUpdated: number; epicsNotFound: string[]; ambiguousTeams: string[]; sprintsImported: number;
  } | null>(null);

  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  const [profile, setProfile] = useState({ name: '', email: '', role: 'PORTFOLIO_MANAGER' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ configured: boolean; working: boolean | null; error: string | null } | null>(null);

  const [jira, setJira] = useState({ baseUrl: '', email: '', apiToken: '', projectKey: '', jql: '' });
  const [jiraLinks, setJiraLinks] = useState({ baseUrl: '', projectKey: '' });
  const [savingLinks, setSavingLinks] = useState(false);

  useEffect(() => {
    fetch('/api/settings/profile')
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setProfile({ name: data.profile.name ?? '', email: data.profile.email ?? '', role: data.profile.role ?? 'PORTFOLIO_MANAGER' });
        }
      });
    fetch('/api/settings/db-status')
      .then((res) => res.json())
      .then(setDbStatus)
      .catch(() => setDbStatus({ configured: false, working: null, error: null }));
  }, []);

  async function saveProfile() {
    if (!profile.name.trim()) {
      setNotice({ type: 'error', message: 'Enter a name before saving your profile.' });
      return;
    }
    setSavingProfile(true);
    try {
      await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      setNotice({ type: 'success', message: 'Profile updated — reloading so the top bar picks it up…' });
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Could not save profile.' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function clearData() {
    if (!confirm('This removes every epic currently in EpicFlow. This cannot be undone. Continue?')) return;
    setBusy(true);
    try {
      await fetch('/api/data/clear', { method: 'POST' });
      await refresh();
      setNotice({ type: 'success', message: 'All data cleared.' });
    } finally {
      setBusy(false);
    }
  }

  async function loadSample() {
    setBusy(true);
    try {
      await fetch('/api/data/load-sample', { method: 'POST' });
      await refresh();
      setNotice({ type: 'success', message: 'Sample demo data loaded.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRoadmapUpload(file: File) {
    setBusy(true);
    setNotice(null);
    setRoadmapResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/roadmap-workbook', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', message: json.error ?? 'Import failed.' });
      } else {
        await refresh();
        setRoadmapResult(json);
        setNotice({
          type: 'success',
          message: `Updated ${json.epicsUpdated} epic(s)${json.sprintsImported ? `, imported ${json.sprintsImported} sprint(s)` : ''}.`,
        });
      }
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setBusy(false);
      if (roadmapInputRef.current) roadmapInputRef.current.value = '';
    }
  }

  async function handleExcelUpload(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', importMode);
      const res = await fetch('/api/import/excel', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', message: json.error ?? 'Import failed.' });
      } else {
        await refresh();
        setNotice({
          type: 'success',
          message: `Imported ${json.imported} epic${json.imported === 1 ? '' : 's'}${json.newUsers ? `, created ${json.newUsers} new owner(s)` : ''}${json.newTeams ? `, ${json.newTeams} new team(s)` : ''}.`,
        });
      }
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleJiraCsvUpload(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', importMode);
      const res = await fetch('/api/import/jira-csv', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', message: json.error ?? 'Import failed.' });
      } else {
        await refresh();
        setNotice({
          type: 'success',
          message: `Imported ${json.imported} epic${json.imported === 1 ? '' : 's'} from the Jira export${json.newUsers ? `, created ${json.newUsers} new owner(s)` : ''}${json.skippedNonEpic ? `. Skipped ${json.skippedNonEpic} non-Epic row(s)` : ''}.`,
        });
      }
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  async function saveJiraLinks() {
    setSavingLinks(true);
    try {
      await fetch('/api/settings/jira-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jiraLinks),
      });
      setNotice({ type: 'success', message: 'Jira link settings saved — "Open in Jira" and preview will now show up on epic pages.' });
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setSavingLinks(false);
    }
  }

  async function syncJira() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/import/jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...jira, mode: importMode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ type: 'error', message: json.error ?? 'Jira sync failed.' });
      } else {
        await refresh();
        setNotice({ type: 'success', message: `Synced ${json.imported} epic(s) from Jira.` });
      }
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Jira sync failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-800">Data Source</h1>
        <p className="text-sm text-muted">
          {loading ? 'Loading…' : `${epics.length} epic${epics.length === 1 ? '' : 's'} currently in EpicFlow`}
        </p>
      </div>

      {notice && (
        <Card
          className={`flex items-start gap-2 px-4 py-3 text-sm ${
            notice.type === 'success' ? 'border-health-green/30 bg-health-green/5 text-ink-800' : 'border-health-red/30 bg-health-red/5 text-ink-800'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-health-green" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-health-red" />
          )}
          <span>{notice.message}</span>
        </Card>
      )}

      <Card>
        <CardHeader title="Storage" subtitle="Where your data actually lives right now" />
        <div className="space-y-2 p-5 text-sm">
          {dbStatus === null ? (
            <p className="text-muted">Checking…</p>
          ) : dbStatus.configured && dbStatus.working ? (
            <p className="flex items-center gap-1.5 text-health-green">
              <CheckCircle2 size={14} /> Connected to a real Postgres database. Your data will survive reloads, restarts, and redeploys.
            </p>
          ) : dbStatus.configured && !dbStatus.working ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-health-red">
                <AlertCircle size={14} /> DATABASE_URL is set, but the connection failed.
              </p>
              {dbStatus.error && <p className="rounded bg-field px-2 py-1 font-mono text-xs text-muted">{dbStatus.error}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-health-amber">
                <AlertCircle size={14} /> Using a local file — this will NOT survive a reload or environment restart.
              </p>
              <p className="text-xs text-muted">
                To fix this permanently: create a free database at{' '}
                <a href="https://neon.tech" target="_blank" rel="noreferrer" className="text-accent-600 underline">neon.tech</a>,
                copy its connection string, and set it as the <code className="rounded bg-field px-1">DATABASE_URL</code> environment
                variable for this project (in StackBlitz: create a <code className="rounded bg-field px-1">.env</code> file at the
                project root with <code className="rounded bg-field px-1">DATABASE_URL=your-connection-string</code>, then restart the
                dev server). Real Postgres tables get created automatically the first time the app reads or writes data —
                no manual setup needed beyond that one line.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Your profile" subtitle="Shown in the top bar — there's no real login yet, so this is set manually" />
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Name" placeholder="Your full name" value={profile.name} onChange={(v) => setProfile((p) => ({ ...p, name: v }))} />
            <Field label="Email" placeholder="you@company.com" value={profile.email} onChange={(v) => setProfile((p) => ({ ...p, email: v }))} />
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">Role</span>
              <select
                value={profile.role}
                onChange={(e) => setProfile((p) => ({ ...p, role: e.target.value }))}
                className="w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-600 disabled:opacity-50"
          >
            <User size={14} /> {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Current data" subtitle="Clear everything, or reload the demo dataset for reference" />
        <div className="flex flex-wrap gap-3 p-5">
          <button
            onClick={clearData}
            disabled={busy}
            className="flex items-center gap-1.5 rounded border border-health-red/40 px-3 py-1.5 text-sm font-medium text-health-red hover:bg-health-red/5 disabled:opacity-50"
          >
            <Trash2 size={14} /> Clear all data
          </button>
          <button
            onClick={loadSample}
            disabled={busy}
            className="flex items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm text-ink-700 hover:bg-field disabled:opacity-50"
          >
            <Database size={14} /> Load sample demo data
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Import mode" subtitle="Applies to both Excel and Jira imports below" />
        <div className="flex gap-4 p-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={importMode === 'append'} onChange={() => setImportMode('append')} />
            Append / update — add new epics, update existing ones matched by key
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
            Replace — wipe existing epics first
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Enrich from a roadmap workbook" subtitle="Adds Budget, Component, Demand Driver, Comp Pts, # Sprints, and team assignment onto epics already in EpicFlow" />
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted">
            This is different from the Excel import below — it never creates new epics. It only updates epics that
            already exist here, matched by epic key (e.g. MERF-12345) found in an "Epic #" column. It also looks for
            a sprint calendar sheet (columns: Sprint, Start, End) in the same file and builds the Sprint Schedule
            page from it. Team assignment only happens on an exact match to Avengers, Titans, or Spartans — those
            three teams always exist in EpicFlow regardless of what's in the file.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={roadmapInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleRoadmapUpload(e.target.files[0])}
              disabled={busy}
              className="text-sm text-ink-700 file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-ink-600"
            />
            {busy && <RefreshCw size={14} className="animate-spin text-muted" />}
          </div>
          {roadmapResult && (
            <div className="space-y-1.5 rounded border border-line bg-field px-3 py-2 text-xs text-ink-700">
              <p>{roadmapResult.epicsUpdated} epic(s) updated · {roadmapResult.sprintsImported} sprint(s) imported</p>
              {roadmapResult.epicsNotFound.length > 0 && (
                <p className="text-health-amber">
                  Not found in EpicFlow (referenced in the sheet but no matching epic here): {roadmapResult.epicsNotFound.join(', ')}
                </p>
              )}
              {roadmapResult.ambiguousTeams.length > 0 && (
                <p className="text-muted">
                  Skipped team assignment for ambiguous values (not an exact Avengers/Titans/Spartans match): {roadmapResult.ambiguousTeams.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Upload from Excel" subtitle="Bring your own spreadsheet of epics" />
        <div className="space-y-3 p-5">
          <a
            href="/api/data/template"
            className="flex w-fit items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm text-ink-700 hover:bg-field"
          >
            <Download size={14} /> Download template (.xlsx)
          </a>
          <p className="text-xs text-muted">
            Fill in the template — only Title and Product Area are required — then upload it below. Owners and teams
            are matched by name and created automatically if they don't already exist.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])}
              disabled={busy}
              className="text-sm text-ink-700 file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-ink-600"
            />
            {busy && <RefreshCw size={14} className="animate-spin text-muted" />}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Import a Jira CSV export" subtitle="No network access needed — works even if the live Jira sync below can't reach your instance" />
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted">
            In Jira: open your board or backlog, go to Issue Navigator, filter to the issues you want (e.g.{' '}
            <code className="rounded bg-field px-1">issuetype = Epic</code>), then Export &gt; Export CSV (all fields
            or current fields, either works). Upload the downloaded file here.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && handleJiraCsvUpload(e.target.files[0])}
              disabled={busy}
              className="text-sm text-ink-700 file:mr-3 file:rounded file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-ink-600"
            />
            {busy && <RefreshCw size={14} className="animate-spin text-muted" />}
          </div>
          <p className="text-xs text-muted">
            Only rows where Issue Type is "Epic" are imported by default. If your export doesn't have that column or
            you want everything imported regardless of type, ask me to add a toggle for it.
          </p>
          <p className="rounded border border-accent-100 bg-accent-50 px-3 py-2 text-xs text-ink-800">
            Already imported epics from an earlier export? Re-upload the same (or a newer) CSV in <strong>Append /
            update</strong> mode above — it now also captures Component and Fix Version, and matches existing epics
            by key, so this enriches what's already here instead of duplicating or losing anything, including any
            manual reordering or matrix classification you've already done.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Jira links" subtitle="Just for 'Open in Jira' and ticket previews — no API token needed" />
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted">
            If you imported via CSV and didn't set up the full Jira API connection below, add your Jira base URL and
            project key here so epic pages can link back to the real ticket, and the New Epic form can offer
            "Create in Jira instead."
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Jira base URL" placeholder="https://yourcompany.atlassian.net" value={jiraLinks.baseUrl} onChange={(v) => setJiraLinks((j) => ({ ...j, baseUrl: v }))} />
            <Field label="Project key" placeholder="PROJ" value={jiraLinks.projectKey} onChange={(v) => setJiraLinks((j) => ({ ...j, projectKey: v }))} />
          </div>
          <button
            onClick={saveJiraLinks}
            disabled={savingLinks || !jiraLinks.baseUrl || !jiraLinks.projectKey}
            className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-600 disabled:opacity-50"
          >
            {savingLinks ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Connect to Jira" subtitle="Pull epics directly from a Jira Cloud project" />
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted">
            Create an API token at{' '}
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-accent-600 underline">
              id.atlassian.com/manage-profile/security/api-tokens
            </a>
            . Credentials are stored locally in this app's data folder, not sent anywhere else.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Jira base URL" placeholder="https://yourcompany.atlassian.net" value={jira.baseUrl} onChange={(v) => setJira((j) => ({ ...j, baseUrl: v }))} />
            <Field label="Project key" placeholder="PROJ" value={jira.projectKey} onChange={(v) => setJira((j) => ({ ...j, projectKey: v }))} />
            <Field label="Email" placeholder="you@company.com" value={jira.email} onChange={(v) => setJira((j) => ({ ...j, email: v }))} />
            <Field label="API token" placeholder="••••••••••••" type="password" value={jira.apiToken} onChange={(v) => setJira((j) => ({ ...j, apiToken: v }))} />
          </div>
          <Field
            label="Custom JQL (optional)"
            placeholder={`project = "${jira.projectKey || 'PROJ'}" AND issuetype = Epic`}
            value={jira.jql}
            onChange={(v) => setJira((j) => ({ ...j, jql: v }))}
          />
          <button
            onClick={syncJira}
            disabled={busy || !jira.baseUrl || !jira.email || !jira.apiToken || !jira.projectKey}
            className="flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-600 disabled:opacity-50"
          >
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            Sync from Jira
          </button>
          <p className="text-xs text-muted">
            This calls Jira's REST API directly from your server — it hasn't been tested against a live Jira site
            from the environment this app was built in, so if status names or fields look off after your first
            sync, check <code className="rounded bg-field px-1">src/app/api/import/jira/route.ts</code> — the
            status mapping table at the top is the most likely thing to need adjusting for your workflow.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}
