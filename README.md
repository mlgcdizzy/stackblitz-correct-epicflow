# EpicFlow

Portfolio epic tracking, prioritization, and roadmap planning for product organizations — built against the PRD with Next.js 14 (App Router), TypeScript, Tailwind, Prisma/PostgreSQL, and NextAuth (Microsoft Entra ID).

## What's actually running vs. what's scaffolded

Being direct about this up front:

### Fully implemented and working today
- **No dummy data by default** — EpicFlow starts completely empty. All data lives in `.data/portfolio.json` (created automatically on first run), which every API route reads and writes.
- **Excel import** — download a template from the Settings page (or `GET /api/data/template`), fill it in, upload it back. Owners and teams are matched by name and created automatically if new. See `src/app/api/import/excel/route.ts`.
- **Jira Cloud import** — connect a Jira base URL, email, API token, and project key from the Settings page to pull real epics via Jira's REST API v3. **This has not been tested against a live Jira instance** — it was written from Atlassian's public API docs in an environment with no outbound network access. The status-name mapping (`STATUS_MAP` in `src/app/api/import/jira/route.ts`) is the most likely thing to need adjusting for your project's actual workflow statuses; everything else should work as documented, but treat the first sync as a test run.
- **Data model** — `prisma/schema.prisma` models every object in the PRD (Epic, Strategic Objective, Pillar, OKR, Theme, Team, Dependency, Comment, SavedView, Notification, AuditEvent, IntegrationLink) with real relations, ready for Postgres when you outgrow the JSON-file store.
- **Prioritization engine** (`src/lib/prioritization.ts`) — RICE, WSJF, and the custom Product Value Score, computed exactly to the PRD's formulas; Strategic Alignment Score; Portfolio Health Score with the weighted breakdown; capacity risk classification; priority-matrix quadrant logic.
- **All core screens**, each with an empty state pointing to Settings when there's no data yet — Dashboard, Epics list with filtering, Epic detail with live score breakdowns, drag-and-drop Prioritization Matrix, quarterly Roadmap, Capacity planning, Strategy/OKR alignment, and Executive/Planning Reports.
- **Report exports** — Excel (`exceljs`), PDF (`pdfkit`), and PowerPoint (`pptxgenjs`), generated from whatever's currently in the store.
- **AI epic summary** — calls the Anthropic API when `ANTHROPIC_API_KEY` is set; falls back to a deterministic template otherwise.
- **Sample data** — the original demo dataset still exists (`src/lib/sample-data.ts`) and can be reloaded any time from Settings, purely for reference; it's never loaded automatically.

### Scaffolded, needs your credentials to go live
- **Microsoft Entra ID SSO** — fully wired in `src/lib/auth.ts`; needs an App Registration in your tenant.
- **Postgres** — the app runs on a flat JSON file by default so it works with zero setup. `prisma/schema.prisma` and `prisma/seed.ts` are ready for when you want real multi-user persistence; each API route has a comment showing the Prisma call that replaces its current JSON-file read/write.

### Documented but not built
- **Azure DevOps / Microsoft Planner / Power BI / Teams sync** (PRD §17) — needs a real Azure DevOps org to build and test against honestly.
- **AI Prioritization/Planning assistants beyond the epic summary** (PRD §15).
- **Email/Teams notification delivery** — the `Notification` model exists; delivery needs SMTP/Graph credentials.
- **Deployment** — targets Vercel + managed Postgres; not deployed since that needs your accounts.

## Getting started

```bash
npm install
npm run dev                # starts empty — go to /settings to import your epics
```

Three ways to get data in, all from the **Data Source** page in the sidebar:
1. **Upload Excel** — download the template, fill it in, upload it.
2. **Connect Jira** — paste your Jira base URL, email, API token, and project key, then Sync.
3. **Load sample data** — reloads the original demo dataset, if you want to see the UI populated for reference.

To switch from the JSON-file store to Postgres:

```bash
cp .env.example .env       # fill in DATABASE_URL
npm run db:migrate
npm run db:seed            # optional — seeds the sample dataset into Postgres
# then swap each API route's store.ts calls for the prisma calls
# noted in comments throughout src/app/api/**/route.ts
```

## Architecture

```
src/
  app/                  Next.js App Router pages + API routes
    page.tsx            Dashboard
    epics/              Epic list + detail
    matrix/             Prioritization matrix
    roadmap/            Quarterly/monthly roadmap
    capacity/           Capacity planning
    strategy/           Pillars, objectives, OKRs
    reports/            Executive/Planning reports + export
    api/                REST endpoints (epics, prioritize, health-score, ai/summary, reports/*)
  components/           Sidebar, top bar, shared UI primitives (Card, badges, stat cards)
  lib/
    types.ts            Domain types (mirrors the Prisma schema)
    mock-data.ts         Seed dataset used until Postgres is connected
    prioritization.ts    RICE / WSJF / Custom scoring, alignment, health score, capacity risk
    aggregations.ts       Dashboard/report roll-ups built on prioritization.ts
    auth.ts               NextAuth + Entra ID configuration
    db.ts                 Prisma client singleton
prisma/
  schema.prisma          Full production data model
  seed.ts                 Seeds Postgres with the same demo portfolio
```

## Design system

Palette and typography are defined as Tailwind tokens in `tailwind.config.ts` — an ink-navy structural color, a single amber accent reserved for priority/attention signals, and IBM Plex Sans/Mono (mono used specifically for epic IDs and scores, where a tabular data feel earns its place). Adjust there to match your brand.
