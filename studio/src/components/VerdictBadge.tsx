import { CheckCircle2, AlertOctagon, HelpCircle } from 'lucide-react';
import type { Verdict } from '../lib/api';
import { cn } from '../lib/utils';

const STYLES = {
  APPROVE: { label: 'Approve', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300', Icon: CheckCircle2 },
  REQUEST_CHANGES: { label: 'Request changes', cls: 'bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-300', Icon: AlertOctagon },
  OTHER: { label: 'Other', cls: 'bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:text-zinc-300', Icon: HelpCircle },
} as const;

export function VerdictBadge({ verdict, compact = false }: { verdict: Verdict; compact?: boolean }) {
  if (!verdict) return null;
  const { label, cls, Icon } = STYLES[verdict];
  // Compact is a bare icon: the colour carries the verdict, no pill behind it.
  if (compact) {
    return (
      <span title={label} className={cn('inline-flex items-center py-0.5', cls.split(' ').filter((c) => c.startsWith('text-') || c.startsWith('dark:text-')).join(' '))}>
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span title={label} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', cls)}>
      <Icon className="size-3.5" aria-hidden />
      {!compact && label}
    </span>
  );
}
