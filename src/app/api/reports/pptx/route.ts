import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import { readPortfolio } from '@/lib/store';
import { findOwnerName } from '@/lib/lookups';
import { scoreCustom } from '@/lib/prioritization';
import { portfolioHealth, executiveSummary } from '@/lib/aggregations';

export async function GET(req: NextRequest) {
  const type = new URL(req.url).searchParams.get('type') ?? 'executive';
  const { epics, users, teams, dependencies } = await readPortfolio();

  const pptx = new PptxGenJS();
  const health = portfolioHealth(epics, teams, dependencies);
  const summary = executiveSummary(epics);

  const title = pptx.addSlide();
  title.background = { color: '0B2942' };
  title.addText('EpicFlow', { x: 0.5, y: 2.2, fontSize: 40, color: 'FFFFFF', bold: true });
  title.addText(type === 'executive' ? 'Executive Report' : 'Planning Report', {
    x: 0.5, y: 3.0, fontSize: 20, color: 'E0952E',
  });

  const overview = pptx.addSlide();
  overview.addText('Portfolio Overview', { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: '0B2942' });
  overview.addText(
    [
      { text: `Total Epics: ${summary.total}\n`, options: {} },
      { text: `Active: ${summary.active}   Blocked: ${summary.blocked}   Committed: ${summary.committed}\n`, options: {} },
      { text: `Portfolio Health Score: ${health.score}/100 (${health.band})`, options: { bold: true } },
    ],
    { x: 0.5, y: 1.2, fontSize: 16, color: '1E293B' }
  );

  const top = [...epics]
    .map((e) => ({ epic: e, score: scoreCustom(e) ?? 0 }))
    .sort((a, b) => {
      const ar = a.epic.priorityRank;
      const br = b.epic.priorityRank;
      if (ar != null && br != null) return ar - br;
      if (ar != null) return -1;
      if (br != null) return 1;
      return b.score - a.score;
    })
    .slice(0, 10);

  const table = pptx.addSlide();
  table.addText('Top 10 Epics', { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: '0B2942' });
  table.addTable(
    [
      [{ text: 'Epic', options: { bold: true } }, { text: 'Owner', options: { bold: true } }, { text: 'Score', options: { bold: true } }],
      ...top.map(({ epic, score }) => [epic.title, findOwnerName(users, epic.ownerId), score.toFixed(2)]),
    ],
    { x: 0.5, y: 1.0, w: 9, fontSize: 11, autoPage: true }
  );

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="epicflow-${type}-report.pptx"`,
    },
  });
}
