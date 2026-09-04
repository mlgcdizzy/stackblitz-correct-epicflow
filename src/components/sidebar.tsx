'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ListChecks,
  Grid2x2,
  CalendarRange,
  CalendarClock,
  Compass,
  Users,
  FileBarChart2,
  Layers,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePortfolio } from '@/lib/use-portfolio';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/epics', label: 'Epics', icon: ListChecks },
  { href: '/matrix', label: 'Prioritization Matrix', icon: Grid2x2 },
  { href: '/roadmap', label: 'Roadmap', icon: CalendarRange },
  { href: '/sprints', label: 'Sprint Schedule', icon: CalendarClock },
  { href: '/strategy', label: 'Strategy', icon: Compass },
  { href: '/capacity', label: 'Capacity', icon: Users },
  { href: '/reports', label: 'Reports', icon: FileBarChart2 },
  { href: '/settings', label: 'Data Source', icon: Database },
];

function currentQuarterLabel() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `Q${q} ${now.getFullYear()}`;
}

export function Sidebar() {
  const pathname = usePathname();
  const { epics, loading } = usePortfolio();

  const blocked = epics.filter((e) => e.status === 'BLOCKED').length;
  const active = epics.filter((e) => !['RELEASED', 'CANCELLED'].includes(e.status)).length;

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-ink text-ink-50">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-ink-900">
          <Layers size={18} strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-semibold leading-tight text-white">EpicFlow</p>
          <p className="text-[11px] leading-tight text-ink-300">Portfolio Planning</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-ink-600 text-white font-medium'
                  : 'text-ink-200 hover:bg-ink-700 hover:text-white'
              )}
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-600 px-4 py-4 text-xs text-ink-300">
        <p className="font-medium text-ink-100">{currentQuarterLabel()}</p>
        {loading ? (
          <p>Loading portfolio…</p>
        ) : epics.length === 0 ? (
          <p>No epics yet</p>
        ) : (
          <p>{active} active{blocked > 0 ? ` · ${blocked} blocked` : ''}</p>
        )}
      </div>
    </aside>
  );
}
