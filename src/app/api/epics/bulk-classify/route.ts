import { NextRequest, NextResponse } from 'next/server';
import { bulkClassifyEpics } from '@/lib/store';

export async function POST(req: NextRequest) {
  const { epicIds, matrixValue, matrixEffort } = await req.json();
  if (!Array.isArray(epicIds) || typeof matrixValue !== 'number' || typeof matrixEffort !== 'number') {
    return NextResponse.json({ error: 'epicIds (array), matrixValue (number), and matrixEffort (number) are required' }, { status: 400 });
  }
  const epics = await bulkClassifyEpics(epicIds, matrixValue, matrixEffort);
  return NextResponse.json({ classified: epicIds.length, totalEpics: epics.length });
}
