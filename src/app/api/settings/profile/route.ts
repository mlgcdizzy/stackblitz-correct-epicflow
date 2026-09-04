import { NextRequest, NextResponse } from 'next/server';
import { readProfile, writeProfile } from '@/lib/store';
import type { Role } from '@/lib/types';

// This is deliberately its OWN storage, separate from the `users` table.
// An earlier version of this endpoint used `users[0]` as a stand-in for
// "you," which had two serious problems: (1) database row order isn't
// guaranteed without an explicit sort, so "the first user" was arbitrary
// and could change between loads, and (2) saving your profile actually
// overwrote whichever real Jira-imported person happened to be first —
// silently renaming a real teammate. This version never touches `users`.

export async function GET() {
  const profile = await readProfile();
  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  const { name, email, role } = (await req.json()) as { name: string; email?: string; role: Role };
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const profile = { name: name.trim(), email: email?.trim() || 'you@example.com', role };
  await writeProfile(profile);
  return NextResponse.json({ profile });
}
