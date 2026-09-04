import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { readPortfolio, upsertEpics, upsertUsers } from '@/lib/store';
import { mapJiraStatus, mapJiraPriorityToRisk, parseJiraDate, quarterFromDate } from '@/lib/jira-mapping';
import type { Epic } from '@/lib/types';

// Jira's native "Export to CSV" (Issue Navigator > Export > CSV) produces a
// very wide file — often 1000+ columns, because every multi-value field
// (Labels, Components, Fix versions, Watchers, issue links, etc.) gets one
// column per value. This importer only reads the columns EpicFlow actually
// uses; everything else in the export is ignored, not misread.
//
// Because this only parses a file you already downloaded, it needs no
// outbound network access — this is the import path to use if the live
// Jira API sync (src/app/api/import/jira) can't reach your Jira instance
// from wherever this app is hosted.

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Returns the column indices (0-based) of every header cell matching `name` case-insensitively. */
function findColumnIndices(headerRow: string[], name: string): number[] {
  const target = name.trim().toLowerCase();
  const indices: number[] = [];
  headerRow.forEach((h, i) => {
    if ((h ?? '').trim().toLowerCase() === target) indices.push(i);
  });
  return indices;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');
  const mode = (formData.get('mode') as 'append' | 'replace') ?? 'append';
  const epicsOnly = formData.get('epicsOnly') !== 'false'; // default true

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded. Attach a .csv file under the "file" field.' }, { status: 400 });
  }

  const text = await file.text();
  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet;
  try {
    sheet = await workbook.csv.read(Readable.from([text]));
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not parse this file as CSV.', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const headerRow: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerRow[colNumber - 1] = String(cell.value ?? '');
  });

  const col = (name: string) => findColumnIndices(headerRow, name)[0]; // first occurrence, for single-value fields
  const colAll = (name: string) => findColumnIndices(headerRow, name); // all occurrences, for multi-value fields

  const idxSummary = col('Summary');
  const idxKey = col('Issue key');
  const idxType = col('Issue Type');
  const idxStatus = col('Status');
  const idxProjectName = col('Project name');
  const idxProjectKey = col('Project key');
  const idxPriority = col('Priority');
  const idxAssignee = col('Assignee');
  const idxCreated = col('Created');
  const idxDueDate = col('Due date');
  const idxDescription = col('Description');
  const idxLabelCols = colAll('Labels');
  const idxComponentCols = colAll('Components');
  const idxFixVersionCols = colAll('Fix versions');

  if (idxSummary == null || idxKey == null) {
    return NextResponse.json(
      { error: 'This doesn\'t look like a Jira CSV export — missing "Summary" or "Issue key" columns.' },
      { status: 400 }
    );
  }

  function cellAt(row: ExcelJS.Row, idx: number | undefined): string {
    if (idx == null) return '';
    const v = row.getCell(idx + 1).value;
    return v == null ? '' : String(v).trim();
  }

  const existing = await readPortfolio();
  const newUsers: { id: string; name: string; email: string; role: 'PRODUCT_MANAGER'; productAreas: string[] }[] = [];
  const parsedEpics: Epic[] = [];
  let skippedNonEpic = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const issueType = cellAt(row, idxType);
    if (epicsOnly && issueType && issueType.toLowerCase() !== 'epic') {
      skippedNonEpic++;
      return;
    }

    const title = cellAt(row, idxSummary);
    const epicKey = cellAt(row, idxKey);
    if (!title || !epicKey) return;

    const assigneeName = cellAt(row, idxAssignee);
    let ownerId: string | undefined;
    if (assigneeName) {
      const slug = `u-${slugify(assigneeName)}`;
      const existsAlready = existing.users.find((u) => u.name.toLowerCase() === assigneeName.toLowerCase());
      ownerId = existsAlready?.id ?? slug;
      if (!existsAlready && !newUsers.find((u) => u.id === slug)) {
        newUsers.push({ id: slug, name: assigneeName, email: `${slugify(assigneeName)}@imported.local`, role: 'PRODUCT_MANAGER', productAreas: [] });
      }
    }

    const productArea = cellAt(row, idxProjectName) || cellAt(row, idxProjectKey) || 'Unassigned';
    const createdIso = parseJiraDate(cellAt(row, idxCreated)) ?? new Date().toISOString();
    const dueIso = parseJiraDate(cellAt(row, idxDueDate));
    const { targetQuarter, targetYear } = quarterFromDate(dueIso);

    const tags = idxLabelCols.map((i) => cellAt(row, i)).filter(Boolean);
    const components = idxComponentCols.map((i) => cellAt(row, i)).filter(Boolean);
    const fixVersions = idxFixVersionCols.map((i) => cellAt(row, i)).filter(Boolean);

    // Components are the most specific real categorization signal Jira gives
    // us — a lot more useful for grouping than "Project name", which is
    // usually the same single value across an entire export. Fall back to
    // project name only when an epic has no component set.
    const component = components[0];
    const resolvedProductArea = component || productArea;

    parsedEpics.push({
      id: `jira-csv-${epicKey}`,
      epicKey,
      title,
      description: cellAt(row, idxDescription),
      productArea: resolvedProductArea,
      component,
      fixVersion: fixVersions[0],
      status: mapJiraStatus(cellAt(row, idxStatus) || 'To Do'),
      ownerId,
      riskLevel: mapJiraPriorityToRisk(cellAt(row, idxPriority)),
      tags,
      targetQuarter,
      targetYear,
      createdAt: createdIso,
    });
  });

  if (parsedEpics.length === 0) {
    return NextResponse.json(
      {
        error: epicsOnly
          ? 'No rows with Issue Type = "Epic" were found. If your export mixes issue types, that\'s expected — uncheck "Epics only" to import everything, or re-export from Jira filtered to Epics.'
          : 'No valid rows found in this file.',
      },
      { status: 400 }
    );
  }

  if (newUsers.length) await upsertUsers(newUsers);
  const epics = await upsertEpics(parsedEpics, mode);

  return NextResponse.json({
    imported: parsedEpics.length,
    totalEpics: epics.length,
    newUsers: newUsers.length,
    skippedNonEpic,
  });
}
