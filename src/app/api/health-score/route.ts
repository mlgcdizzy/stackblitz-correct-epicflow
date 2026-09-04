import { NextResponse } from 'next/server';
import { readPortfolio } from '@/lib/store';
import { portfolioHealth } from '@/lib/aggregations';

export async function GET() {
  const { epics, teams, dependencies } = await readPortfolio();
  const health = portfolioHealth(epics, teams, dependencies);
  return NextResponse.json(health);
}
