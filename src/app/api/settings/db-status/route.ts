import { NextResponse } from 'next/server';

export async function GET() {
  const connected = Boolean(process.env.DATABASE_URL);
  let working: boolean | null = null;
  let error: string | null = null;

  if (connected) {
    try {
      const { readPortfolio } = await import('@/lib/store');
      await readPortfolio();
      working = true;
    } catch (err) {
      working = false;
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({ configured: connected, working, error });
}
