import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { readPortfolio, updateEpic, upsertTeams, upsertSprints } from '@/lib/store';

// This importer is tailored to a specific kind of workbook: a team's
// planning/roadmap spreadsheet that already references real epic keys
// (e.g. MERF-12345) for work that's already been imported into EpicFlow
// from Jira. It NEVER creates new epics — only enriches ones that already
// exist, matched by key. It also looks for a sprint-calendar sheet and
// builds the Sprint Schedule page from it if found.
//
// Sheet-finding is done by header signature rather than a fixed sheet name,
// so this keeps working if sheets get renamed or reordered:
//   - Roadmap sheet: has both "Epic #" and "Comp Pts" columns somewhere
//   - Sprint sheet: has "Sprint", "Start", and "End" columns

const CANONICAL_TEAMS = ['Avengers', 'Titans', 'Spartans'];

function normalizeHeader(h: unknown): string {
  return String(h ?? '').trim().toLowerCase();
}

function findHeaderRow(sheet: ExcelJS.Worksheet): { headers: string[] } {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(cell.value);
  });
  return { headers };
}

function colIndex(headers: string[], name: string): number | undefined {
  const target = normalizeHeader(name);
  const idx = headers.findIndex((h) => h === target);
  return idx === -1 ? undefined : idx;
}

function cellText(row: ExcelJS.Row, idx: number | undefined): string {
  if (idx == null) return '';
  const v = row.getCell(idx + 1).value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text ?? '');
  return String(v).trim();
}

function cellNumber(row: ExcelJS.Row, idx: number | undefined): number | undefined {
  const raw = cellText(row, idx);
  if (!raw) return undefined;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

function cellDateIso(row: ExcelJS.Row, idx: number | undefined): string | undefined {
  if (idx == null) return undefined;
  const v = row.getCell(idx + 1).value;
  if (v instanceof Date) return v.toISOString();
  return undefined;
}

const EPIC_KEY_PATTERN = /[A-Z]{2,}-\d+/g;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));

  const { epics: existingEpics } = await readPortfolio();
  const epicByKey = new Map(existingEpics.map((e) => [e.epicKey.toUpperCase(), e]));

  const pendingUpdates: Promise<unknown>[] = [];

  // --- 1. Find and process the roadmap/enrichment sheet ---
  let roadmapSheet: ExcelJS.Worksheet | undefined;
  let roadmapHeaders: string[] = [];
  for (const sheet of workbook.worksheets) {
    const { headers } = findHeaderRow(sheet);
    if (colIndex(headers, 'Epic #') != null && colIndex(headers, 'Comp Pts') != null) {
      roadmapSheet = sheet;
      roadmapHeaders = headers;
      break;
    }
  }

  let epicsUpdated = 0;
  const notFound = new Set<string>();
  const teamAmbiguous = new Set<string>();

  if (roadmapSheet) {
    const idx = {
      budget: colIndex(roadmapHeaders, 'Budget'),
      component: colIndex(roadmapHeaders, 'Component'),
      team: colIndex(roadmapHeaders, 'Team'),
      epicKey: colIndex(roadmapHeaders, 'Epic #')!,
      demandDriver: colIndex(roadmapHeaders, 'Demand Driver'),
      compPoints: colIndex(roadmapHeaders, 'Comp Pts'),
      numSprints: colIndex(roadmapHeaders, '# Sprints'),
      devStart: colIndex(roadmapHeaders, 'Dev Start'),
      devEnd: colIndex(roadmapHeaders, 'Dev End'),
    };

    roadmapSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawKeyCell = cellText(row, idx.epicKey);
      if (!rawKeyCell) return;

      const keysInCell = rawKeyCell.toUpperCase().match(EPIC_KEY_PATTERN) ?? [];
      if (keysInCell.length === 0) return;

      const budget = cellText(row, idx.budget) || undefined;
      const component = cellText(row, idx.component) || undefined;
      const teamRaw = cellText(row, idx.team);
      const demandDriver = cellText(row, idx.demandDriver) || undefined;
      const compPoints = cellNumber(row, idx.compPoints);
      const numSprints = cellNumber(row, idx.numSprints);
      const devStart = cellDateIso(row, idx.devStart);
      const devEnd = cellDateIso(row, idx.devEnd);

      const matchedTeam = CANONICAL_TEAMS.find((t) => t.toLowerCase() === teamRaw.trim().toLowerCase());
      if (teamRaw && !matchedTeam) teamAmbiguous.add(teamRaw);

      for (const key of keysInCell) {
        const epic = epicByKey.get(key);
        if (!epic) {
          notFound.add(key);
          continue;
        }

        const updates: Record<string, unknown> = {};
        if (budget) updates.budget = budget;
        if (component) updates.component = component;
        if (demandDriver) updates.demandDriver = demandDriver;
        if (compPoints != null) updates.compPoints = compPoints;
        if (numSprints != null) updates.numSprints = numSprints;
        if (devStart) updates.devStart = devStart;
        if (devEnd) updates.devEnd = devEnd;
        if (matchedTeam) updates.teamId = `team-${matchedTeam.toLowerCase()}`;

        if (Object.keys(updates).length > 0) {
          pendingUpdates.push(updateEpic(epic.id, updates));
          epicsUpdated++;
        }
      }
    });
  }

  // Always ensure the three canonical Merchant Fraud teams exist, regardless
  // of whether this specific upload referenced them.
  await upsertTeams(
    CANONICAL_TEAMS.map((name) => ({
      id: `team-${name.toLowerCase()}`,
      name,
      manager: '',
      capacity: 0,
      velocity: 0,
      availableEngineers: 0,
      availablePMs: 0,
      designCapacity: 0,
      qaCapacity: 0,
    }))
  );

  await Promise.all(pendingUpdates);

  // --- 2. Find and process the sprint schedule sheet ---
  let sprintSheet: ExcelJS.Worksheet | undefined;
  let sprintHeaders: string[] = [];
  for (const sheet of workbook.worksheets) {
    const { headers } = findHeaderRow(sheet);
    if (colIndex(headers, 'Sprint') != null && colIndex(headers, 'Start') != null && colIndex(headers, 'End') != null) {
      sprintSheet = sheet;
      sprintHeaders = headers;
      break;
    }
  }

  let sprintsImported = 0;
  if (sprintSheet) {
    const idx = {
      start: colIndex(sprintHeaders, 'Start')!,
      end: colIndex(sprintHeaders, 'End')!,
    };
    const rows: { startIso: string; endIso: string }[] = [];
    sprintSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const startIso = cellDateIso(row, idx.start);
      const endIso = cellDateIso(row, idx.end);
      if (startIso && endIso) rows.push({ startIso, endIso });
    });

    // The source sheet's own "Sprint" number column is unreliable — Excel
    // drops trailing zeros from decimals, so "2026.10" and "2026.1" both
    // read back as 2026.1. Rebuild sprint numbers from row order within
    // each year instead, which is unambiguous since rows are chronological.
    const byYear = new Map<number, { startIso: string; endIso: string }[]>();
    for (const r of rows) {
      const year = new Date(r.startIso).getFullYear();
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(r);
    }

    const sprintsToSave: { id: string; year: number; number: number; startDate: string; endDate: string }[] = [];
    for (const [year, yearRows] of byYear.entries()) {
      yearRows.forEach((r, i) => {
        sprintsToSave.push({
          id: `sprint-${year}-${i + 1}`,
          year,
          number: i + 1,
          startDate: r.startIso,
          endDate: r.endIso,
        });
      });
    }

    await upsertSprints(sprintsToSave);
    sprintsImported = sprintsToSave.length;
  }

  if (!roadmapSheet && !sprintSheet) {
    return NextResponse.json(
      { error: 'Could not find a recognizable roadmap sheet (needs "Epic #" and "Comp Pts" columns) or sprint schedule sheet (needs "Sprint", "Start", "End" columns) in this workbook.' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    epicsUpdated,
    epicsNotFound: Array.from(notFound),
    ambiguousTeams: Array.from(teamAmbiguous),
    sprintsImported,
    foundRoadmapSheet: Boolean(roadmapSheet),
    foundSprintSheet: Boolean(sprintSheet),
  });
}
