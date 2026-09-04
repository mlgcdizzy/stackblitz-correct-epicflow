import { NextResponse } from 'next/server';
import { clearPortfolio } from '@/lib/store';

export async function POST() {
  await clearPortfolio();
  return NextResponse.json({ cleared: true });
}
