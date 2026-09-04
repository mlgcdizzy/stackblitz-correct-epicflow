import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio } from '@/lib/store';
import { scoreEpic, normalizeScores, type ScoringModelKey } from '@/lib/prioritization';

const VALID_MODELS: ScoringModelKey[] = ['RICE', 'WSJF', 'CUSTOM'];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const model: ScoringModelKey = VALID_MODELS.includes(body.model) ? body.model : 'RICE';
  const epicIds: string[] | undefined = body.epicIds;

  const { epics } = await readPortfolio();
  const target = epicIds ? epics.filter((e) => epicIds.includes(e.id)) : epics;
  const rawScores = target.map((e) => scoreEpic(e, model));
  const normalized = normalizeScores(rawScores);

  const results = target.map((e, i) => ({
    epicId: e.id,
    epicKey: e.epicKey,
    model,
    rawScore: rawScores[i],
    normalizedScore: normalized[i],
  }));

  // In production: persist each result as a PrioritizationScore row
  // (upsert on the [epicId, model] unique constraint) and emit a
  // PRIORITY_CHANGED notification when a score moves more than one
  // std. deviation from its prior value.

  return NextResponse.json({ model, results });
}
