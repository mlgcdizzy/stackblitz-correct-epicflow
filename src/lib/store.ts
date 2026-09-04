import fs from 'fs';
import path from 'path';
import type { Epic, Team, StrategicPillar, StrategicObjective, Theme, User, Dependency, Sprint } from './types';
import * as neonStore from './db-neon';

/**
 * EpicFlow data store.
 *
 * Two backends, same function signatures, chosen automatically:
 *  - Postgres via Neon's HTTP driver (src/lib/db-neon.ts), when DATABASE_URL
 *    is set. This is real, permanent persistence — survives reloads,
 *    container restarts, redeploys, everything.
 *  - A local JSON file under .data/, used only when no database is
 *    configured. Convenient for a first look with zero setup, but does NOT
 *    survive environment resets (e.g. a StackBlitz container going idle).
 *
 * Every exported function below checks which backend is active and
 * delegates accordingly, so nothing else in the app needs to know or care
 * which one is in use.
 */

export interface PortfolioData {
  users: User[];
  teams: Team[];
  pillars: StrategicPillar[];
  objectives: StrategicObjective[];
  themes: Theme[];
  epics: Epic[];
  dependencies: Dependency[];
  sprints: Sprint[];
}

export interface JiraConnection {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  jql?: string;
  lastSyncedAt?: string;
}

export interface AppProfile {
  name: string;
  email: string;
  role: string;
}

function usingDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

// --- file backend (fallback) ---

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'portfolio.json');
const JIRA_CONFIG_FILE = path.join(DATA_DIR, 'jira-connection.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

const EMPTY_PORTFOLIO: PortfolioData = {
  users: [
    { id: 'u1', name: 'You', email: 'you@example.com', role: 'ADMIN', productAreas: [] },
  ],
  teams: [],
  pillars: [],
  objectives: [],
  themes: [],
  epics: [],
  dependencies: [],
  sprints: [],
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readPortfolioFile(): PortfolioData {
  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_PORTFOLIO, null, 2));
      return structuredClone(EMPTY_PORTFOLIO);
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as PortfolioData;
    if (!data.sprints) data.sprints = []; // back-compat with files written before sprints existed
    return data;
  } catch (err) {
    console.error('Failed to read portfolio file, returning empty portfolio:', err);
    return structuredClone(EMPTY_PORTFOLIO);
  }
}

function writePortfolioFile(data: PortfolioData) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- public API (branches to the active backend) ---

export async function readPortfolio(): Promise<PortfolioData> {
  return usingDatabase() ? neonStore.readPortfolio() : readPortfolioFile();
}

export async function writePortfolio(data: PortfolioData) {
  if (usingDatabase()) throw new Error('writePortfolio() is file-backend-only; use the specific update functions with a database.');
  writePortfolioFile(data);
}

export async function clearPortfolio() {
  if (usingDatabase()) return neonStore.clearPortfolio();
  const current = readPortfolioFile();
  current.epics = [];
  writePortfolioFile(current);
}

/** Merges new epics into the store, keyed by epicKey. In 'append' mode,
 *  existing rows are updated (not replaced) so re-importing a source file
 *  to pick up new fields never wipes manual work like priorityRank or
 *  matrixValue/matrixEffort set from drag-and-drop inside EpicFlow. */
export async function upsertEpics(newEpics: Epic[], mode: 'append' | 'replace' = 'append') {
  if (usingDatabase()) return neonStore.upsertEpics(newEpics, mode);

  const current = readPortfolioFile();
  if (mode === 'replace') {
    current.epics = newEpics;
  } else {
    const byKey = new Map(current.epics.map((e) => [e.epicKey, e]));
    for (const e of newEpics) {
      const existing = byKey.get(e.epicKey);
      byKey.set(e.epicKey, existing ? { ...existing, ...e } : e);
    }
    current.epics = Array.from(byKey.values());
  }
  writePortfolioFile(current);
  return current.epics;
}

export async function upsertUsers(newUsers: User[]) {
  if (usingDatabase()) return neonStore.upsertUsers(newUsers);

  const current = readPortfolioFile();
  const byId = new Map(current.users.map((u) => [u.id, u]));
  for (const u of newUsers) byId.set(u.id, u);
  current.users = Array.from(byId.values());
  writePortfolioFile(current);
  return current.users;
}

export async function upsertSprints(newSprints: Sprint[]) {
  if (usingDatabase()) return neonStore.upsertSprints(newSprints);

  const current = readPortfolioFile();
  const byId = new Map((current.sprints ?? []).map((s) => [s.id, s]));
  for (const s of newSprints) byId.set(s.id, s);
  current.sprints = Array.from(byId.values());
  writePortfolioFile(current);
  return current.sprints;
}

export async function upsertTeams(newTeams: Team[]) {
  if (usingDatabase()) return neonStore.upsertTeams(newTeams);

  const current = readPortfolioFile();
  const byName = new Map(current.teams.map((t) => [t.name, t]));
  for (const t of newTeams) byName.set(t.name, t);
  current.teams = Array.from(byName.values());
  writePortfolioFile(current);
  return current.teams;
}

export async function reorderEpics(orderedIds: string[]) {
  if (usingDatabase()) return neonStore.reorderEpics(orderedIds);

  const current = readPortfolioFile();
  const rankById = new Map(orderedIds.map((id, i) => [id, i]));
  current.epics = current.epics.map((e) => (rankById.has(e.id) ? { ...e, priorityRank: rankById.get(e.id) } : e));
  writePortfolioFile(current);
  return current.epics;
}

export async function bulkClassifyEpics(epicIds: string[], matrixValue: number, matrixEffort: number) {
  if (usingDatabase()) return neonStore.bulkClassifyEpics(epicIds, matrixValue, matrixEffort);

  const current = readPortfolioFile();
  const idSet = new Set(epicIds);
  current.epics = current.epics.map((e) => (idSet.has(e.id) ? { ...e, matrixValue, matrixEffort } : e));
  writePortfolioFile(current);
  return current.epics;
}

export async function updateEpic(id: string, updates: Partial<Epic>) {
  if (usingDatabase()) return neonStore.updateEpic(id, updates);

  const current = readPortfolioFile();
  const index = current.epics.findIndex((e) => e.id === id);
  if (index === -1) return null;
  current.epics[index] = { ...current.epics[index], ...updates };
  writePortfolioFile(current);
  return current.epics[index];
}

export async function deleteEpicById(id: string) {
  if (usingDatabase()) return neonStore.deleteEpicById(id);

  const current = readPortfolioFile();
  current.epics = current.epics.filter((e) => e.id !== id);
  writePortfolioFile(current);
  return current.epics;
}

export async function loadSampleData() {
  if (usingDatabase()) return neonStore.loadSampleData();

  const sample = await import('./sample-data');
  writePortfolioFile({
    users: sample.users,
    teams: sample.teams,
    pillars: sample.pillars,
    objectives: sample.objectives,
    themes: sample.themes,
    epics: sample.epics,
    dependencies: sample.dependencies,
    sprints: [],
  });
}

// --- Jira connection config (stored separately from portfolio data) ---

export async function readJiraConnection(): Promise<JiraConnection | null> {
  if (usingDatabase()) return neonStore.readJiraConnection();

  try {
    ensureDataDir();
    if (!fs.existsSync(JIRA_CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(JIRA_CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export async function writeJiraConnection(conn: JiraConnection) {
  if (usingDatabase()) return neonStore.writeJiraConnection(conn);

  ensureDataDir();
  fs.writeFileSync(JIRA_CONFIG_FILE, JSON.stringify(conn, null, 2));
}

// --- Your profile (deliberately separate from `users` — that list holds
// real people imported from Jira/Excel, and using an arbitrary entry from
// it as "you" caused this app to silently overwrite a real teammate's name
// with whatever you typed. This is its own isolated record.) ---

export async function readProfile(): Promise<AppProfile | null> {
  if (usingDatabase()) return neonStore.readProfile();

  try {
    ensureDataDir();
    if (!fs.existsSync(PROFILE_FILE)) return null;
    return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export async function writeProfile(profile: AppProfile) {
  if (usingDatabase()) return neonStore.writeProfile(profile);

  ensureDataDir();
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}
