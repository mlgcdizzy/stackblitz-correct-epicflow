import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { readPortfolio } from '@/lib/store';
import { findOwnerName } from '@/lib/lookups';
import { scoreCustom } from '@/lib/prioritization';
import { portfolioHealth } from '@/lib/aggregations';

export async function GET(req: NextRequest) {
  const type = new URL(req.url).searchParams.get('type') ?? 'executive';
  const { epics, users, teams, dependencies } = await readPortfolio();

  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const health = portfolioHealth(epics, teams, dependencies);

  doc.fontSize(20).fillColor('#0B2942').text('EpicFlow', { continued: false });
  doc.fontSize(13).fillColor('#64748B').text(type === 'executive' ? 'Executive Report' : 'Planning Report');
  doc.moveDown(1);

  doc.fontSize(11).fillColor('#0B2942').text(`Portfolio Health Score: ${health.score}/100 (${health.band})`);
  doc.moveDown(1);

  doc.fontSize(13).fillColor('#0B2942').text('Top Epics by Product Value Score', { underline: true });
  doc.moveDown(0.5);

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
    .slice(0, 20);

  doc.fontSize(10).fillColor('#1E293B');
  for (const { epic, score } of top) {
    doc.text(`${epic.epicKey}  ${epic.title}  —  Owner: ${findOwnerName(users, epic.ownerId)}  —  Score: ${score.toFixed(2)}`);
  }

  doc.end();
  const buffer = await done;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="epicflow-${type}-report.pdf"`,
    },
  });
}
