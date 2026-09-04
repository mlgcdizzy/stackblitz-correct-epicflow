import { cn } from '@/lib/utils';
import type { EpicStatus, RiskLevel } from '@/lib/types';

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-md border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between border-b border-line px-5 py-3.5">
      <div>
        <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_STYLE: Record<EpicStatus, string> = {
  IDEA: 'bg-status-idea/10 text-status-idea',
  DISCOVERY: 'bg-status-discovery/10 text-status-discovery',
  VALIDATED: 'bg-status-validated/10 text-status-validated',
  PLANNED: 'bg-status-planned/10 text-status-planned',
  COMMITTED: 'bg-status-committed/10 text-status-committed',
  IN_PROGRESS: 'bg-status-progress/10 text-status-progress',
  BLOCKED: 'bg-status-blocked/10 text-status-blocked',
  RELEASED: 'bg-status-released/10 text-status-released',
  CANCELLED: 'bg-status-cancelled/10 text-status-cancelled',
};

const STATUS_LABEL: Record<EpicStatus, string> = {
  IDEA: 'Idea',
  DISCOVERY: 'Discovery',
  VALIDATED: 'Validated',
  PLANNED: 'Planned',
  COMMITTED: 'Committed',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  RELEASED: 'Released',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: { status: EpicStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const RISK_STYLE: Record<RiskLevel, string> = {
  LOW: 'bg-health-green/10 text-health-green',
  MEDIUM: 'bg-health-amber/10 text-health-amber',
  HIGH: 'bg-accent-600/10 text-accent-600',
  CRITICAL: 'bg-health-red/10 text-health-red',
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize', RISK_STYLE[risk])}>
      {risk.toLowerCase()}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneClass = {
    default: 'text-ink-800',
    good: 'text-health-green',
    warn: 'text-health-amber',
    bad: 'text-health-red',
  }[tone];

  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-1.5 font-mono text-2xl font-semibold', toneClass)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function ProgressBar({ value, max = 100, colorClass = 'bg-ink-500' }: { value: number; max?: number; colorClass?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={cn('h-full rounded-full', colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}
