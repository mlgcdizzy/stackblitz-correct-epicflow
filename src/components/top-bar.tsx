'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Bell, Plus } from 'lucide-react';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopBar() {
  const [profile, setProfile] = useState<{ name: string; role: string } | null | undefined>(undefined);

  useEffect(() => {
    fetch('/api/settings/profile')
      .then((res) => res.json())
      .then((data) => setProfile(data.profile))
      .catch(() => setProfile(null));
  }, []);

  const loading = profile === undefined;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-6">
      <div className="flex w-96 items-center gap-2 rounded border border-line bg-field px-3 py-1.5">
        <Search size={15} className="text-muted" />
        <input
          type="text"
          placeholder="Search epics, objectives, teams…"
          className="w-full bg-transparent text-sm text-ink-800 placeholder:text-muted focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/epics/new"
          className="flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-600"
        >
          <Plus size={15} />
          New Epic
        </Link>
        <button className="relative text-muted hover:text-ink-700" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700">
            {loading ? '—' : profile ? initials(profile.name) : '?'}
          </div>
          <div className="leading-tight">
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : profile ? (
              <>
                <p className="text-sm font-medium text-ink-800">{profile.name}</p>
                <p className="text-[11px] text-muted">{profile.role.replace('_', ' ')}</p>
              </>
            ) : (
              <Link href="/settings" className="text-xs text-accent-600 hover:underline">
                Set your name in Settings
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
