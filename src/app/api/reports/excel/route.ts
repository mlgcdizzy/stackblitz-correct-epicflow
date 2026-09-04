import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { readPortfolio } from '@/lib/store';
import { findOwnerName, findTeamName } from '@/lib/lookups';
import { scoreRICE, scoreWSJF, scoreCustom } from '@/lib/prioritization';

export async function GET(req: NextRequest) {
  const type = new URL(req.url).searchParams.get('type') ?? 'executive';
  const { epics, users, teams } = await readPortfolio();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EpicFlow';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(type === 'executive' ? 'Executive Report' : 'Planning Report');
  sheet.columns = [
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Epic Key', key: 'key', width: 12 },
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Owner', key: 'owner', width: 18 },
    { header: 'Team', key: 'team', width: 18 },
    { header: 'Product Area', key: 'area', width: 16 },
    { header: 'Target', key: 'target', width: 10 },
    { header: 'Risk', key: 'risk', width: 10 },
    { header: 'RICE', key: 'rice', width: 10 },
    { header: 'WSJF', key: 'wsjf', width: 10 },
    { header: 'Product Value Score', key: 'custom', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2942' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const sorted = [...epics].sort((a, b) => {
    if (a.priorityRank != null && b.priorityRank != null) return a.priorityRank - b.priorityRank;
    if (a.priorityRank != null) return -1;
    if (b.priorityRank != null) return 1;
    return (scoreCustom(b) ?? 0) - (scoreCustom(a) ?? 0);
  });

  for (const e of sorted) {
    sheet.addRow({
      priority: e.priorityRank != null ? e.priorityRank + 1 : '',
      key: e.epicKey,
      title: e.title,
      status: e.status,
      owner: findOwnerName(users, e.ownerId),
      team: findTeamName(teams, e.teamId),
      area: e.productArea,
      target: e.targetQuarter ? `${e.targetQuarter} ${e.targetYear ?? ''}`.trim() : '',
      risk: e.riskLevel,
      rice: scoreRICE(e)?.toFixed(2) ?? '',
      wsjf: scoreWSJF(e)?.toFixed(2) ?? '',
      custom: scoreCustom(e)?.toFixed(2) ?? '',
    });
  }

  sheet.autoFilter = { from: 'A1', to: 'L1' };

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="epicflow-${type}-report.xlsx"`,
    },
  });
}
