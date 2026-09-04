import { NextRequest, NextResponse } from 'next/server';
import { readJiraConnection, writeJiraConnection } from '@/lib/store';

// Separate from the full Jira API sync (src/app/api/import/jira) — this only
// stores enough to build "Open in Jira" / "Create in Jira" links for people
// who imported via CSV and never set up the live API connection.

export async function POST(req: NextRequest) {
  const { baseUrl, projectKey } = await req.json();
  if (!baseUrl || !projectKey) {
    return NextResponse.json({ error: 'baseUrl and projectKey are required' }, { status: 400 });
  }

  const existing = await readJiraConnection();
  await writeJiraConnection({
    baseUrl: baseUrl.replace(/\/$/, ''),
    projectKey,
    email: existing?.email ?? '',
    apiToken: existing?.apiToken ?? '',
    jql: existing?.jql,
    lastSyncedAt: existing?.lastSyncedAt,
  });

  return NextResponse.json({ saved: true });
}
