import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio, updateEpic, deleteEpicById } from '@/lib/store';
import { scoreRICE, scoreWSJF, scoreCustom, scoreAlignment } from '@/lib/prioritization';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { epics } = await readPortfolio();
  const epic = epics.find((e) => e.id === params.id);
  if (!epic) return NextResponse.json({ error: 'Epic not found' }, { status: 404 });

  return NextResponse.json({
    epic,
    scores: {
      rice: scoreRICE(epic),
      wsjf: scoreWSJF(epic),
      custom: scoreCustom(epic),
      alignment: epic.alignment ? scoreAlignment(epic.alignment) : null,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const updates = await req.json();
  const updated = await updateEpic(params.id, updates);
  if (!updated) return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
  return NextResponse.json({ epic: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteEpicById(params.id);
  return NextResponse.json({ deleted: true, id: params.id });
}
