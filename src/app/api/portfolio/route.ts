import { NextResponse } from 'next/server';
import { readPortfolio } from '@/lib/store';

export async function GET() {
  const data = await readPortfolio();
  return NextResponse.json(data);
}
