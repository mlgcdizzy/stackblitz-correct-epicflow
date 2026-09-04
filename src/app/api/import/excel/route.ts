import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { readPortfolio, upsertEpics, upsertUsers, upsertTeams } from '@/lib/store';
import { EPIC_STATUSES, type Epic, type EpicStatus, type RiskLevel } from '@/lib/types';

const RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text ?? '');
  return String(v).trim();
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');
  const mode = (formData.get('mode') as 'append' | 'replace') ?? 'append';

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded. Attach an .xlsx file under the "file" field.' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(arrayBuffer));

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: 'The workbook has no sheets.' }, { status: 400 });
  }

  const headerRow = sheet.getRow(1).values as unknown[];
  const headerIndex: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    if (typeof h === 'string') headerIndex[h.trim().toLowerCase()] = i;
  });

  function cell(row: ExcelJS.Row, headerLabel: string) {
    const idx = headerIndex[headerLabel.toLowerCase()];
    return idx ? row.getCell(idx).value : undefined;
  }

  const existing = await readPortfolio();
  const newUsers: { id: string; name: string; email: string; role: 'PRODUCT_MANAGER'; productAreas: string[] }[] = [];
  const newTeams: { id: string; name: string; manager: string; capacity: number; velocity: number; availableEngineers: number; availablePMs: number; designCapacity: number; qaCapacity: number }[] = [];
  const parsedEpics: Epic[] = [];
  const errors: string[] = [];

  let rowNum = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    rowNum = rowNumber;

    const title = str(cell(row, 'Title'));
    const productArea = str(cell(row, 'Product Area'));
    if (!title && !productArea) return; // skip fully blank rows

    if (!title) {
      errors.push(`Row ${rowNumber}: missing Title, skipped.`);
      return;
    }
    if (!productArea) {
      errors.push(`Row ${rowNumber}: missing Product Area, skipped.`);
      return;
    }

    const ownerName = str(cell(row, 'Owner')) || 'Unassigned';
    let ownerId: string | undefined;
    if (ownerName !== 'Unassigned') {
      const ownerSlug = `u-${slugify(ownerName)}`;
      const existsAlready = existing.users.find((u) => u.name.toLowerCase() === ownerName.toLowerCase());
      ownerId = existsAlready?.id ?? ownerSlug;
      if (!existsAlready && !newUsers.find((u) => u.id === ownerSlug)) {
        newUsers.push({ id: ownerSlug, name: ownerName, email: `${slugify(ownerName)}@imported.local`, role: 'PRODUCT_MANAGER', productAreas: [productArea] });
      }
    }

    const teamName = str(cell(row, 'Team'));
    let teamId: string | undefined;
    if (teamName) {
      const teamSlug = `t-${slugify(teamName)}`;
      const existsAlready = existing.teams.find((t) => t.name.toLowerCase() === teamName.toLowerCase());
      teamId = existsAlready?.id ?? teamSlug;
      if (!existsAlready && !newTeams.find((t) => t.id === teamSlug)) {
        newTeams.push({ id: teamSlug, name: teamName, manager: '', capacity: 0, velocity: 0, availableEngineers: 0, availablePMs: 0, designCapacity: 0, qaCapacity: 0 });
      }
    }

    const statusRaw = str(cell(row, 'Status')).toUpperCase().replace(/\s+/g, '_');
    const status: EpicStatus = (EPIC_STATUSES as string[]).includes(statusRaw) ? (statusRaw as EpicStatus) : 'IDEA';

    const riskRaw = str(cell(row, 'Risk Level')).toUpperCase();
    const riskLevel: RiskLevel = (RISK_LEVELS as string[]).includes(riskRaw) ? (riskRaw as RiskLevel) : 'MEDIUM';

    const tagsRaw = str(cell(row, 'Tags (comma separated)'));
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

    const idBase = `imp-${Date.now()}-${rowNumber}`;

    parsedEpics.push({
      id: idBase,
      epicKey: `EPIC-${1000 + existing.epics.length + parsedEpics.length}`,
      title,
      description: str(cell(row, 'Description')),
      productArea,
      status,
      ownerId,
      teamId,
      targetQuarter: str(cell(row, 'Target Quarter')) || undefined,
      targetYear: num(cell(row, 'Target Year')),
      riskLevel,
      storyPoints: num(cell(row, 'Story Points')),
      tags,
      createdAt: new Date().toISOString(),
      reach: num(cell(row, 'Reach')),
      impact: num(cell(row, 'Impact')),
      confidence: num(cell(row, 'Confidence (0-1)')),
      effort: num(cell(row, 'Effort')),
      businessValue: num(cell(row, 'Business Value (1-10)')),
      timeCriticality: num(cell(row, 'Time Criticality (1-10)')),
      riskReduction: num(cell(row, 'Risk Reduction (1-10)')),
      jobSize: num(cell(row, 'Job Size')),
      revenueImpact: num(cell(row, 'Revenue Impact (1-5)')),
      customerImpact: num(cell(row, 'Customer Impact (1-5)')),
      strategicAlignment: num(cell(row, 'Strategic Alignment (1-5)')),
      competitivePressure: num(cell(row, 'Competitive Pressure (1-5)')),
      riskScore: num(cell(row, 'Risk Score (1-5)')),
      engineeringComplexity: num(cell(row, 'Engineering Complexity (1-5)')),
    });
  });

  if (parsedEpics.length === 0) {
    return NextResponse.json(
      { error: 'No valid epic rows found. Make sure Title and Product Area are filled in.', errors },
      { status: 400 }
    );
  }

  if (newUsers.length) await upsertUsers(newUsers);
  if (newTeams.length) await upsertTeams(newTeams);
  const epics = await upsertEpics(parsedEpics, mode);

  return NextResponse.json({
    imported: parsedEpics.length,
    totalEpics: epics.length,
    newUsers: newUsers.length,
    newTeams: newTeams.length,
    warnings: errors,
  });
}
