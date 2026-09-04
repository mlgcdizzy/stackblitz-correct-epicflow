import { neon } from '@neondatabase/serverless';
import type { Epic, User, Team, StrategicPillar, StrategicObjective, Theme, Dependency, Sprint } from './types';
import type { PortfolioData, JiraConnection, AppProfile } from './store';

/**
 * Real Postgres persistence via Neon's HTTP driver.
 *
 * Why this and not Prisma/raw `pg`: those connect over a raw TCP socket,
 * which StackSockblitz's WebContainer (and similar browser-sandboxed dev
 * environments) cannot open — that's exactly why the live Jira API sync
 * struggled earlier. Neon's serverless driver instead sends each query as a
 * plain HTTPS request, the same kind of network call that already works for
 * everything else in this app. It's a genuine Postgres database — this
 * isn't a workaround dressed up as one.
 *
 * This activates automatically when DATABASE_URL is set. Without it, the
 * app falls back to the local JSON file (see store.ts) so nothing breaks
 * for anyone who hasn't set up a database yet.
 */

let schemaReady: Promise<void> | null = null;

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = createSchema();
  return schemaReady;
}

async function createSchema() {
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL, product_areas JSONB NOT NULL DEFAULT '[]'
  )`;
  await db`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, manager TEXT,
    capacity DOUBLE PRECISION DEFAULT 0, velocity DOUBLE PRECISION DEFAULT 0,
    available_engineers INT DEFAULT 0, available_pms INT DEFAULT 0,
    design_capacity DOUBLE PRECISION DEFAULT 0, qa_capacity DOUBLE PRECISION DEFAULT 0
  )`;
  await db`CREATE TABLE IF NOT EXISTS pillars (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL)`;
  await db`CREATE TABLE IF NOT EXISTS objectives (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, executive_owner TEXT,
    start_date TEXT, end_date TEXT, weight DOUBLE PRECISION DEFAULT 1, pillar_id TEXT
  )`;
  await db`CREATE TABLE IF NOT EXISTS themes (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL)`;
  await db`CREATE TABLE IF NOT EXISTS epics (
    id TEXT PRIMARY KEY, epic_key TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT,
    product_area TEXT, status TEXT NOT NULL, owner_id TEXT, theme_id TEXT, pillar_id TEXT,
    objective_id TEXT, team_id TEXT, target_quarter TEXT, target_year INT, risk_level TEXT NOT NULL,
    story_points DOUBLE PRECISION, t_shirt_size TEXT, expected_duration_weeks DOUBLE PRECISION,
    component TEXT, fix_version TEXT, priority_rank INT, matrix_value DOUBLE PRECISION,
    matrix_effort DOUBLE PRECISION, alignment JSONB, tags JSONB NOT NULL DEFAULT '[]', notes TEXT,
    created_at TEXT NOT NULL, reach DOUBLE PRECISION, impact DOUBLE PRECISION, confidence DOUBLE PRECISION,
    effort DOUBLE PRECISION, business_value DOUBLE PRECISION, time_criticality DOUBLE PRECISION,
    risk_reduction DOUBLE PRECISION, job_size DOUBLE PRECISION, revenue_impact DOUBLE PRECISION,
    customer_impact DOUBLE PRECISION, strategic_alignment DOUBLE PRECISION,
    competitive_pressure DOUBLE PRECISION, risk_score DOUBLE PRECISION, engineering_complexity DOUBLE PRECISION,
    budget TEXT, demand_driver TEXT, comp_points DOUBLE PRECISION, num_sprints DOUBLE PRECISION,
    dev_start TEXT, dev_end TEXT
  )`;
  await db`CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY, source_epic_id TEXT, target_epic_id TEXT,
    dependency_type TEXT, status TEXT, notes TEXT
  )`;
  await db`CREATE TABLE IF NOT EXISTS jira_connection (
    id TEXT PRIMARY KEY DEFAULT 'singleton', base_url TEXT, email TEXT,
    api_token TEXT, project_key TEXT, jql TEXT, last_synced_at TEXT
  )`;
  await db`CREATE TABLE IF NOT EXISTS sprints (
    id TEXT PRIMARY KEY, year INT NOT NULL, number INT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL
  )`;
  await db`CREATE TABLE IF NOT EXISTS app_profile (
    id TEXT PRIMARY KEY DEFAULT 'singleton', name TEXT, email TEXT, role TEXT
  )`;

  // Safe migration for anyone who already connected before these columns
  // existed — CREATE TABLE IF NOT EXISTS above only affects brand-new
  // tables, so existing ones need this to pick up new fields.
  await db`ALTER TABLE epics ADD COLUMN IF NOT EXISTS budget TEXT`;
  await db`ALTER TABLE epics ADD COLUMN IF NOT EXISTS demand_driver TEXT`;
  await db`ALTER TABLE epics ADD COLUMN IF NOT EXISTS comp_points DOUBLE PRECISION`;
  await db`ALTER TABLE epics ADD COLUMN IF NOT EXISTS num_sprints DOUBLE PRECISION`;
  await db`ALTER TABLE epics ADD COLUMN IF NOT EXISTS dev_start TEXT`;
  await db`ALTER TABLE epics ADD COLUMN IF NOT EXISTS dev_end TEXT`;
}

// --- row <-> app-type mapping ---

function rowToEpic(r: any): Epic {
  return {
    id: r.id, epicKey: r.epic_key, title: r.title, description: r.description ?? '',
    productArea: r.product_area ?? '', status: r.status, ownerId: r.owner_id ?? undefined,
    themeId: r.theme_id ?? undefined, pillarId: r.pillar_id ?? undefined, objectiveId: r.objective_id ?? undefined,
    teamId: r.team_id ?? undefined, targetQuarter: r.target_quarter ?? undefined, targetYear: r.target_year ?? undefined,
    riskLevel: r.risk_level, storyPoints: r.story_points ?? undefined, tShirtSize: r.t_shirt_size ?? undefined,
    expectedDurationWeeks: r.expected_duration_weeks ?? undefined, component: r.component ?? undefined,
    fixVersion: r.fix_version ?? undefined, priorityRank: r.priority_rank ?? undefined,
    matrixValue: r.matrix_value ?? undefined, matrixEffort: r.matrix_effort ?? undefined,
    alignment: r.alignment ?? undefined, tags: r.tags ?? [], notes: r.notes ?? undefined,
    createdAt: r.created_at, reach: r.reach ?? undefined, impact: r.impact ?? undefined,
    confidence: r.confidence ?? undefined, effort: r.effort ?? undefined, businessValue: r.business_value ?? undefined,
    timeCriticality: r.time_criticality ?? undefined, riskReduction: r.risk_reduction ?? undefined,
    jobSize: r.job_size ?? undefined, revenueImpact: r.revenue_impact ?? undefined,
    customerImpact: r.customer_impact ?? undefined, strategicAlignment: r.strategic_alignment ?? undefined,
    competitivePressure: r.competitive_pressure ?? undefined, riskScore: r.risk_score ?? undefined,
    engineeringComplexity: r.engineering_complexity ?? undefined,
    budget: r.budget ?? undefined, demandDriver: r.demand_driver ?? undefined,
    compPoints: r.comp_points ?? undefined, numSprints: r.num_sprints ?? undefined,
    devStart: r.dev_start ?? undefined, devEnd: r.dev_end ?? undefined,
  };
}

function rowToUser(r: any): User {
  return { id: r.id, name: r.name, email: r.email, role: r.role, productAreas: r.product_areas ?? [] };
}
function rowToTeam(r: any): Team {
  return {
    id: r.id, name: r.name, manager: r.manager ?? '', capacity: r.capacity ?? 0, velocity: r.velocity ?? 0,
    availableEngineers: r.available_engineers ?? 0, availablePMs: r.available_pms ?? 0,
    designCapacity: r.design_capacity ?? 0, qaCapacity: r.qa_capacity ?? 0,
  };
}
function rowToPillar(r: any): StrategicPillar {
  return { id: r.id, name: r.name };
}
function rowToObjective(r: any): StrategicObjective {
  return {
    id: r.id, title: r.title, description: r.description ?? '', executiveOwner: r.executive_owner ?? '',
    startDate: r.start_date, endDate: r.end_date, weight: r.weight ?? 1, pillarId: r.pillar_id ?? '',
  };
}
function rowToTheme(r: any): Theme {
  return { id: r.id, name: r.name };
}
function rowToDependency(r: any): Dependency {
  return {
    id: r.id, sourceEpicId: r.source_epic_id, targetEpicId: r.target_epic_id,
    dependencyType: r.dependency_type, status: r.status, notes: r.notes ?? undefined,
  };
}
function rowToSprint(r: any): Sprint {
  return { id: r.id, year: r.year, number: r.number, startDate: r.start_date, endDate: r.end_date };
}

// --- reads ---

export async function readPortfolio(): Promise<PortfolioData> {
  await ensureSchema();
  const db = sql();
  const [users, teams, pillars, objectives, themes, epics, dependencies, sprints] = await Promise.all([
    db`SELECT * FROM users`,
    db`SELECT * FROM teams`,
    db`SELECT * FROM pillars`,
    db`SELECT * FROM objectives`,
    db`SELECT * FROM themes`,
    db`SELECT * FROM epics`,
    db`SELECT * FROM dependencies`,
    db`SELECT * FROM sprints ORDER BY year, number`,
  ]);

  return {
    users: (users as any[]).map(rowToUser),
    teams: (teams as any[]).map(rowToTeam),
    pillars: (pillars as any[]).map(rowToPillar),
    objectives: (objectives as any[]).map(rowToObjective),
    themes: (themes as any[]).map(rowToTheme),
    epics: (epics as any[]).map(rowToEpic),
    dependencies: (dependencies as any[]).map(rowToDependency),
    sprints: (sprints as any[]).map(rowToSprint),
  };
}

// --- writes ---

export async function clearPortfolio() {
  await ensureSchema();
  const db = sql();
  await db`DELETE FROM dependencies`;
  await db`DELETE FROM epics`;
}

export async function upsertEpics(newEpics: Epic[], mode: 'append' | 'replace' = 'append'): Promise<Epic[]> {
  await ensureSchema();
  const db = sql();

  if (mode === 'replace') {
    await db`DELETE FROM epics`;
  }

  for (const e of newEpics) {
    await db`
      INSERT INTO epics (
        id, epic_key, title, description, product_area, status, owner_id, theme_id, pillar_id,
        objective_id, team_id, target_quarter, target_year, risk_level, story_points, t_shirt_size,
        expected_duration_weeks, component, fix_version, tags, notes, created_at,
        reach, impact, confidence, effort, business_value, time_criticality, risk_reduction, job_size,
        revenue_impact, customer_impact, strategic_alignment, competitive_pressure, risk_score, engineering_complexity,
        budget, demand_driver, comp_points, num_sprints, dev_start, dev_end
      ) VALUES (
        ${e.id}, ${e.epicKey}, ${e.title}, ${e.description ?? null}, ${e.productArea ?? null}, ${e.status},
        ${e.ownerId ?? null}, ${e.themeId ?? null}, ${e.pillarId ?? null}, ${e.objectiveId ?? null}, ${e.teamId ?? null},
        ${e.targetQuarter ?? null}, ${e.targetYear ?? null}, ${e.riskLevel}, ${e.storyPoints ?? null}, ${e.tShirtSize ?? null},
        ${e.expectedDurationWeeks ?? null}, ${e.component ?? null}, ${e.fixVersion ?? null},
        ${JSON.stringify(e.tags ?? [])}::jsonb, ${e.notes ?? null}, ${e.createdAt},
        ${e.reach ?? null}, ${e.impact ?? null}, ${e.confidence ?? null}, ${e.effort ?? null},
        ${e.businessValue ?? null}, ${e.timeCriticality ?? null}, ${e.riskReduction ?? null}, ${e.jobSize ?? null},
        ${e.revenueImpact ?? null}, ${e.customerImpact ?? null}, ${e.strategicAlignment ?? null},
        ${e.competitivePressure ?? null}, ${e.riskScore ?? null}, ${e.engineeringComplexity ?? null},
        ${e.budget ?? null}, ${e.demandDriver ?? null}, ${e.compPoints ?? null}, ${e.numSprints ?? null},
        ${e.devStart ?? null}, ${e.devEnd ?? null}
      )
      ON CONFLICT (epic_key) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description, product_area = EXCLUDED.product_area,
        status = EXCLUDED.status, owner_id = EXCLUDED.owner_id, theme_id = EXCLUDED.theme_id,
        pillar_id = EXCLUDED.pillar_id, objective_id = EXCLUDED.objective_id, team_id = EXCLUDED.team_id,
        target_quarter = EXCLUDED.target_quarter, target_year = EXCLUDED.target_year, risk_level = EXCLUDED.risk_level,
        story_points = EXCLUDED.story_points, t_shirt_size = EXCLUDED.t_shirt_size,
        expected_duration_weeks = EXCLUDED.expected_duration_weeks, component = EXCLUDED.component,
        fix_version = EXCLUDED.fix_version, tags = EXCLUDED.tags, notes = EXCLUDED.notes,
        reach = EXCLUDED.reach, impact = EXCLUDED.impact, confidence = EXCLUDED.confidence, effort = EXCLUDED.effort,
        business_value = EXCLUDED.business_value, time_criticality = EXCLUDED.time_criticality,
        risk_reduction = EXCLUDED.risk_reduction, job_size = EXCLUDED.job_size,
        revenue_impact = EXCLUDED.revenue_impact, customer_impact = EXCLUDED.customer_impact,
        strategic_alignment = EXCLUDED.strategic_alignment, competitive_pressure = EXCLUDED.competitive_pressure,
        risk_score = EXCLUDED.risk_score, engineering_complexity = EXCLUDED.engineering_complexity
      -- Deliberately NOT updating priority_rank / matrix_value / matrix_effort / budget / demand_driver /
      -- comp_points / num_sprints / dev_start / dev_end here — those are set by drag-and-drop or the
      -- dedicated roadmap-enrichment import, and a routine Jira/Excel re-import should never clobber them.
    `;
  }

  const rows = await db`SELECT * FROM epics`;
  return (rows as any[]).map(rowToEpic);
}

export async function upsertUsers(newUsers: User[]): Promise<User[]> {
  await ensureSchema();
  const db = sql();
  for (const u of newUsers) {
    await db`
      INSERT INTO users (id, name, email, role, product_areas)
      VALUES (${u.id}, ${u.name}, ${u.email}, ${u.role}, ${JSON.stringify(u.productAreas ?? [])}::jsonb)
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, product_areas = EXCLUDED.product_areas
    `;
  }
  const rows = await db`SELECT * FROM users`;
  return (rows as any[]).map(rowToUser);
}

export async function upsertSprints(newSprints: Sprint[]): Promise<Sprint[]> {
  await ensureSchema();
  const db = sql();
  for (const s of newSprints) {
    await db`
      INSERT INTO sprints (id, year, number, start_date, end_date)
      VALUES (${s.id}, ${s.year}, ${s.number}, ${s.startDate}, ${s.endDate})
      ON CONFLICT (id) DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
    `;
  }
  const rows = await db`SELECT * FROM sprints ORDER BY year, number`;
  return (rows as any[]).map(rowToSprint);
}

export async function upsertTeams(newTeams: Team[]): Promise<Team[]> {
  await ensureSchema();
  const db = sql();
  for (const t of newTeams) {
    await db`
      INSERT INTO teams (id, name, manager, capacity, velocity, available_engineers, available_pms, design_capacity, qa_capacity)
      VALUES (${t.id}, ${t.name}, ${t.manager ?? ''}, ${t.capacity ?? 0}, ${t.velocity ?? 0},
        ${t.availableEngineers ?? 0}, ${t.availablePMs ?? 0}, ${t.designCapacity ?? 0}, ${t.qaCapacity ?? 0})
      ON CONFLICT (name) DO NOTHING
    `;
  }
  const rows = await db`SELECT * FROM teams`;
  return (rows as any[]).map(rowToTeam);
}

export async function reorderEpics(orderedIds: string[]): Promise<Epic[]> {
  await ensureSchema();
  const db = sql();

  // Firing one UPDATE per epic all at once (this dataset can be 200+) risks
  // overwhelming the connection and failing silently. Process in small
  // batches instead, and actually surface any failures instead of
  // swallowing them — a silently-failed reorder is exactly what makes
  // priority changes look like they "don't stick."
  const BATCH_SIZE = 15;
  const failures: string[] = [];
  for (let i = 0; i < orderedIds.length; i += BATCH_SIZE) {
    const batch = orderedIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((id, j) => db`UPDATE epics SET priority_rank = ${i + j} WHERE id = ${id}`)
    );
    results.forEach((r, j) => {
      if (r.status === 'rejected') failures.push(batch[j]);
    });
  }

  if (failures.length > 0) {
    throw new Error(`Failed to save priority for ${failures.length} epic(s): ${failures.slice(0, 5).join(', ')}${failures.length > 5 ? '…' : ''}`);
  }

  const rows = await db`SELECT * FROM epics`;
  return (rows as any[]).map(rowToEpic);
}

export async function bulkClassifyEpics(epicIds: string[], matrixValue: number, matrixEffort: number): Promise<Epic[]> {
  await ensureSchema();
  const db = sql();
  await Promise.all(
    epicIds.map((id) => db`UPDATE epics SET matrix_value = ${matrixValue}, matrix_effort = ${matrixEffort} WHERE id = ${id}`)
  );
  const rows = await db`SELECT * FROM epics`;
  return (rows as any[]).map(rowToEpic);
}

export async function updateEpic(id: string, updates: Partial<Epic>): Promise<Epic | null> {
  await ensureSchema();
  const db = sql();

  // One explicit, safe UPDATE per possible field rather than building a
  // dynamic column list — the Neon HTTP driver's tagged-template query
  // function doesn't have a confirmed safe way to parameterize identifiers
  // (only values), so this avoids relying on an unverified API entirely.
  const u = updates as Record<string, unknown>;
  if ('title' in u) await db`UPDATE epics SET title = ${u.title as string} WHERE id = ${id}`;
  if ('description' in u) await db`UPDATE epics SET description = ${u.description as string} WHERE id = ${id}`;
  if ('productArea' in u) await db`UPDATE epics SET product_area = ${u.productArea as string} WHERE id = ${id}`;
  if ('status' in u) await db`UPDATE epics SET status = ${u.status as string} WHERE id = ${id}`;
  if ('ownerId' in u) await db`UPDATE epics SET owner_id = ${(u.ownerId as string) ?? null} WHERE id = ${id}`;
  if ('themeId' in u) await db`UPDATE epics SET theme_id = ${(u.themeId as string) ?? null} WHERE id = ${id}`;
  if ('pillarId' in u) await db`UPDATE epics SET pillar_id = ${(u.pillarId as string) ?? null} WHERE id = ${id}`;
  if ('objectiveId' in u) await db`UPDATE epics SET objective_id = ${(u.objectiveId as string) ?? null} WHERE id = ${id}`;
  if ('teamId' in u) await db`UPDATE epics SET team_id = ${(u.teamId as string) ?? null} WHERE id = ${id}`;
  if ('targetQuarter' in u) await db`UPDATE epics SET target_quarter = ${(u.targetQuarter as string) ?? null} WHERE id = ${id}`;
  if ('targetYear' in u) await db`UPDATE epics SET target_year = ${(u.targetYear as number) ?? null} WHERE id = ${id}`;
  if ('riskLevel' in u) await db`UPDATE epics SET risk_level = ${u.riskLevel as string} WHERE id = ${id}`;
  if ('storyPoints' in u) await db`UPDATE epics SET story_points = ${(u.storyPoints as number) ?? null} WHERE id = ${id}`;
  if ('tShirtSize' in u) await db`UPDATE epics SET t_shirt_size = ${(u.tShirtSize as string) ?? null} WHERE id = ${id}`;
  if ('expectedDurationWeeks' in u) await db`UPDATE epics SET expected_duration_weeks = ${(u.expectedDurationWeeks as number) ?? null} WHERE id = ${id}`;
  if ('component' in u) await db`UPDATE epics SET component = ${(u.component as string) ?? null} WHERE id = ${id}`;
  if ('fixVersion' in u) await db`UPDATE epics SET fix_version = ${(u.fixVersion as string) ?? null} WHERE id = ${id}`;
  if ('priorityRank' in u) await db`UPDATE epics SET priority_rank = ${(u.priorityRank as number) ?? null} WHERE id = ${id}`;
  if ('matrixValue' in u) await db`UPDATE epics SET matrix_value = ${(u.matrixValue as number) ?? null} WHERE id = ${id}`;
  if ('matrixEffort' in u) await db`UPDATE epics SET matrix_effort = ${(u.matrixEffort as number) ?? null} WHERE id = ${id}`;
  if ('notes' in u) await db`UPDATE epics SET notes = ${(u.notes as string) ?? null} WHERE id = ${id}`;
  if ('tags' in u) await db`UPDATE epics SET tags = ${JSON.stringify(u.tags ?? [])}::jsonb WHERE id = ${id}`;
  if ('reach' in u) await db`UPDATE epics SET reach = ${(u.reach as number) ?? null} WHERE id = ${id}`;
  if ('impact' in u) await db`UPDATE epics SET impact = ${(u.impact as number) ?? null} WHERE id = ${id}`;
  if ('confidence' in u) await db`UPDATE epics SET confidence = ${(u.confidence as number) ?? null} WHERE id = ${id}`;
  if ('effort' in u) await db`UPDATE epics SET effort = ${(u.effort as number) ?? null} WHERE id = ${id}`;
  if ('businessValue' in u) await db`UPDATE epics SET business_value = ${(u.businessValue as number) ?? null} WHERE id = ${id}`;
  if ('timeCriticality' in u) await db`UPDATE epics SET time_criticality = ${(u.timeCriticality as number) ?? null} WHERE id = ${id}`;
  if ('riskReduction' in u) await db`UPDATE epics SET risk_reduction = ${(u.riskReduction as number) ?? null} WHERE id = ${id}`;
  if ('jobSize' in u) await db`UPDATE epics SET job_size = ${(u.jobSize as number) ?? null} WHERE id = ${id}`;
  if ('revenueImpact' in u) await db`UPDATE epics SET revenue_impact = ${(u.revenueImpact as number) ?? null} WHERE id = ${id}`;
  if ('customerImpact' in u) await db`UPDATE epics SET customer_impact = ${(u.customerImpact as number) ?? null} WHERE id = ${id}`;
  if ('strategicAlignment' in u) await db`UPDATE epics SET strategic_alignment = ${(u.strategicAlignment as number) ?? null} WHERE id = ${id}`;
  if ('competitivePressure' in u) await db`UPDATE epics SET competitive_pressure = ${(u.competitivePressure as number) ?? null} WHERE id = ${id}`;
  if ('riskScore' in u) await db`UPDATE epics SET risk_score = ${(u.riskScore as number) ?? null} WHERE id = ${id}`;
  if ('engineeringComplexity' in u) await db`UPDATE epics SET engineering_complexity = ${(u.engineeringComplexity as number) ?? null} WHERE id = ${id}`;
  if ('budget' in u) await db`UPDATE epics SET budget = ${(u.budget as string) ?? null} WHERE id = ${id}`;
  if ('demandDriver' in u) await db`UPDATE epics SET demand_driver = ${(u.demandDriver as string) ?? null} WHERE id = ${id}`;
  if ('compPoints' in u) await db`UPDATE epics SET comp_points = ${(u.compPoints as number) ?? null} WHERE id = ${id}`;
  if ('numSprints' in u) await db`UPDATE epics SET num_sprints = ${(u.numSprints as number) ?? null} WHERE id = ${id}`;
  if ('devStart' in u) await db`UPDATE epics SET dev_start = ${(u.devStart as string) ?? null} WHERE id = ${id}`;
  if ('devEnd' in u) await db`UPDATE epics SET dev_end = ${(u.devEnd as string) ?? null} WHERE id = ${id}`;

  const rows = (await db`SELECT * FROM epics WHERE id = ${id}`) as any[];
  return rows[0] ? rowToEpic(rows[0]) : null;
}

export async function deleteEpicById(id: string): Promise<Epic[]> {
  await ensureSchema();
  const db = sql();
  await db`DELETE FROM dependencies WHERE source_epic_id = ${id} OR target_epic_id = ${id}`;
  await db`DELETE FROM epics WHERE id = ${id}`;
  const rows = await db`SELECT * FROM epics`;
  return (rows as any[]).map(rowToEpic);
}

export async function loadSampleData() {
  await ensureSchema();
  const db = sql();
  const sample = await import('./sample-data');

  await db`DELETE FROM dependencies`;
  await db`DELETE FROM epics`;

  for (const u of sample.users) await upsertUsers([u]);
  for (const t of sample.teams) await upsertTeams([t]);
  for (const p of sample.pillars) {
    await db`INSERT INTO pillars (id, name) VALUES (${p.id}, ${p.name}) ON CONFLICT (name) DO NOTHING`;
  }
  for (const th of sample.themes) {
    await db`INSERT INTO themes (id, name) VALUES (${th.id}, ${th.name}) ON CONFLICT (name) DO NOTHING`;
  }
  for (const o of sample.objectives) {
    await db`
      INSERT INTO objectives (id, title, description, executive_owner, start_date, end_date, weight, pillar_id)
      VALUES (${o.id}, ${o.title}, ${o.description}, ${sample.users[3]?.id ?? sample.users[0].id}, ${o.startDate}, ${o.endDate}, ${o.weight}, ${o.pillarId})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  await upsertEpics(sample.epics, 'append');
  for (const d of sample.dependencies) {
    await db`
      INSERT INTO dependencies (id, source_epic_id, target_epic_id, dependency_type, status, notes)
      VALUES (${d.id}, ${d.sourceEpicId}, ${d.targetEpicId}, ${d.dependencyType}, ${d.status}, ${d.notes ?? null})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

// --- Jira connection ---

export async function readJiraConnection(): Promise<JiraConnection | null> {
  await ensureSchema();
  const db = sql();
  const rows = (await db`SELECT * FROM jira_connection WHERE id = 'singleton'`) as any[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    baseUrl: r.base_url, email: r.email, apiToken: r.api_token, projectKey: r.project_key,
    jql: r.jql ?? undefined, lastSyncedAt: r.last_synced_at ?? undefined,
  };
}

export async function writeJiraConnection(conn: JiraConnection) {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO jira_connection (id, base_url, email, api_token, project_key, jql, last_synced_at)
    VALUES ('singleton', ${conn.baseUrl}, ${conn.email}, ${conn.apiToken}, ${conn.projectKey}, ${conn.jql ?? null}, ${conn.lastSyncedAt ?? null})
    ON CONFLICT (id) DO UPDATE SET
      base_url = EXCLUDED.base_url, email = EXCLUDED.email, api_token = EXCLUDED.api_token,
      project_key = EXCLUDED.project_key, jql = EXCLUDED.jql, last_synced_at = EXCLUDED.last_synced_at
  `;
}

// --- Your profile — isolated from the `users` table, which holds real
// imported people. Never picked positionally, never shares an id with a
// real Jira-imported user. ---

export async function readProfile(): Promise<AppProfile | null> {
  await ensureSchema();
  const db = sql();
  const rows = (await db`SELECT * FROM app_profile WHERE id = 'singleton'`) as any[];
  if (rows.length === 0) return null;
  return { name: rows[0].name ?? '', email: rows[0].email ?? '', role: rows[0].role ?? '' };
}

export async function writeProfile(profile: AppProfile) {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO app_profile (id, name, email, role)
    VALUES ('singleton', ${profile.name}, ${profile.email}, ${profile.role})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role
  `;
}
