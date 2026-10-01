import { AlertTriangle, AlertOctagon, CheckCircle2, Clock, HelpCircle, Loader2 } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { cn } from '../lib/utils';

export type BotState = 'pending' | 'reviewing' | 'deepening' | 'deepen-queued' | 'testing' | 'qa-queued' | 'failed' | 'skipped' | 'up_to_date' | undefined;

export const VERDICT_ICON = {
  APPROVE: { Icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', accent: 'border-t-emerald-500' },
  REQUEST_CHANGES: { Icon: AlertOctagon, cls: 'text-red-600 dark:text-red-400', accent: 'border-t-red-500' },
  OTHER: { Icon: HelpCircle, cls: 'text-fg-muted', accent: 'border-t-zinc-400' },
} as const;

// What the bot is doing with this review, shown before the verdict so live
// work is visible at a glance: running, waiting, or broken.
export function TabIcon({ item, bot }: { item: ReviewItem; bot: BotState }) {
  if (bot === 'reviewing' || bot === 'deepening' || bot === 'testing') return <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-pulse text-blue-500" role="img" aria-label="Review in progress" />;
  if (bot === 'failed') return <AlertTriangle className="size-4 shrink-0 text-orange-500" role="img" aria-label="Review failed" />;
  if (bot === 'pending') return <Clock className="size-4 shrink-0 text-fg-subtle" role="img" aria-label="Waiting for review" />;
  const { Icon, cls } = VERDICT_ICON[item.verdict ?? 'OTHER'];
  return <Icon className={cn('size-4 shrink-0', cls)} aria-hidden />;
}

