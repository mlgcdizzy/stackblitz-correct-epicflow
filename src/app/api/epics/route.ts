import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio, upsertEpics } from '@/lib/store';
import { scoreRICE, scoreWSJF, scoreCustom } from '@/lib/prioritization';
import type { Epic } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const productArea = searchParams.get('productArea');

  const { epics } = await readPortfolio();
  let results = epics;
  if (status) results = results.filter((e) => e.status === status);
  if (productArea) results = results.filter((e) => e.productArea === productArea);

  const withScores = results.map((e) => ({
    ...e,
    scores: { rice: scoreRICE(e), wsjf: scoreWSJF(e), custom: scoreCustom(e) },
  }));

  return NextResponse.json({ epics: withScores, total: withScores.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.title || !body.productArea) {
    return NextResponse.json({ error: 'title and productArea are required' }, { status: 400 });
  }

  const { epics } = await readPortfolio();
  const created: Epic = {
    id: `e-${Date.now()}`,
    epicKey: `EPIC-${1000 + epics.length}`,
    status: 'IDEA',
    riskLevel: 'MEDIUM',
    tags: [],
    createdAt: new Date().toISOString(),
    ...body,
  };

  await upsertEpics([created], 'append');

  return NextResponse.json({ epic: created }, { status: 201 });
}
