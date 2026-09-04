import { NextRequest, NextResponse } from 'next/server';
import { reorderEpics } from '@/lib/store';

export async function POST(req: NextRequest) {
  const { orderedIds } = await req.json();
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'orderedIds must be an array of epic ids' }, { status: 400 });
  }
  try {
    const epics = await reorderEpics(orderedIds);
    return NextResponse.json({ reordered: orderedIds.length, totalEpics: epics.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save the new priority order.' },
      { status: 500 }
    );
  }
}
