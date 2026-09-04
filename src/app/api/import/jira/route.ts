import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio, upsertEpics, upsertUsers, writeJiraConnection, readJiraConnection } from '@/lib/store';
import { mapJiraStatus, mapJiraPriorityToRisk } from '@/lib/jira-mapping';
import type { Epic } from '@/lib/types';

// Jira Cloud REST API v3 integration.
//
// NOTE: this was written against Atlassian's published REST API v3 docs but
// has not been exercised against a live Jira instance from this environment
// (no outbound network access here). If your Jira instance blocks requests
// from wherever you're running EpicFlow (some cloud sandboxes have this
// issue), use the CSV import instead — it needs no network access at all.
//
// The status mapping lives in src/lib/jira-mapping.ts — add your project's
// actual status names there if they don't match automatically.

/** Best-effort plain-text extraction from Atlassian Document Format. */
function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text' && n.text) return n.text;
  if (Array.isArray(n.content)) return n.content.map(adfToText).join(' ');
  return '';
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    status?: { name: string };
    assignee?: { displayName: string; accountId: string } | null;
    priority?: { name: string };
    labels?: string[];
    created?: string;
    project?: { name: string; key: string };
  };
}

export async function GET() {
  const conn = await readJiraConnection();
  if (!conn) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, baseUrl: conn.baseUrl, projectKey: conn.projectKey, lastSyncedAt: conn.lastSyncedAt });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { baseUrl, email, apiToken, projectKey, jql, save = true, mode = 'append' } = body as {
    baseUrl: string; email: string; apiToken: string; projectKey: string; jql?: string; save?: boolean; mode?: 'append' | 'replace';
  };

  if (!baseUrl || !email || !apiToken || !projectKey) {
    return NextResponse.json({ error: 'baseUrl, email, apiToken, and projectKey are all required.' }, { status: 400 });
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const effectiveJql = jql?.trim() || `project = "${projectKey}" AND issuetype = Epic ORDER BY created DESC`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const issues: JiraIssue[] = [];
  let startAt = 0;
  const pageSize = 50;
  const maxIssues = 500; // safety cap

  try {
    while (issues.length < maxIssues) {
      const url =
        `${cleanBaseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(effectiveJql)}` +
        `&startAt=${startAt}&maxResults=${pageSize}` +
        `&fields=summary,description,status,assignee,priority,labels,created,project`;

      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
      
        return NextResponse.json(
          {
            url,
            status: res.status,
            detail: text
          },
          { status: 502 }
        );
      }

      const json = await res.json();
      issues.push(...(json.issues ?? []));
      const total = json.total ?? 0;
      startAt += pageSize;
      if (startAt >= total || (json.issues ?? []).length === 0) break;
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach Jira at ${cleanBaseUrl}. Check the base URL and that this server has network access to it.`, detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  if (save) {
    await writeJiraConnection({ baseUrl: cleanBaseUrl, email, apiToken, projectKey, jql: effectiveJql, lastSyncedAt: new Date().toISOString() });
  }

  const existing = await readPortfolio();
  const newUsers: { id: string; name: string; email: string; role: 'PRODUCT_MANAGER'; productAreas: string[] }[] = [];

  const parsedEpics: Epic[] = issues.map((issue) => {
    const assigneeName = issue.fields.assignee?.displayName;
    let ownerId: string | undefined;
    if (assigneeName) {
      const slug = `u-${slugify(assigneeName)}`;
      const existsAlready = existing.users.find((u) => u.name.toLowerCase() === assigneeName.toLowerCase());
      ownerId = existsAlready?.id ?? slug;
      if (!existsAlready && !newUsers.find((u) => u.id === slug)) {
        newUsers.push({ id: slug, name: assigneeName, email: `${slugify(assigneeName)}@imported.local`, role: 'PRODUCT_MANAGER', productAreas: [] });
      }
    }

    return {
      id: `jira-${issue.id}`,
      epicKey: issue.key,
      title: issue.fields.summary,
      description: adfToText(issue.fields.description) || '',
      productArea: issue.fields.project?.name ?? projectKey,
      status: mapJiraStatus(issue.fields.status?.name ?? 'To Do'),
      ownerId,
      riskLevel: mapJiraPriorityToRisk(issue.fields.priority?.name),
      tags: issue.fields.labels ?? [],
      createdAt: issue.fields.created ?? new Date().toISOString(),
    };
  });

  if (newUsers.length) await upsertUsers(newUsers);
  const epics = await upsertEpics(parsedEpics, mode);

  return NextResponse.json({
    imported: parsedEpics.length,
    totalEpics: epics.length,
    newUsers: newUsers.length,
  });
}
