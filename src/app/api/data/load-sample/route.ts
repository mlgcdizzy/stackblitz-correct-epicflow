import { NextResponse } from 'next/server';
import { loadSampleData } from '@/lib/store';

export async function POST() {
  await loadSampleData();
  return NextResponse.json({ loaded: true });
}
