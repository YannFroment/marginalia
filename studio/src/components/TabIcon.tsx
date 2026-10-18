import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { VERDICT_ICON } from '../lib/verdictIcons';
import type { ReviewItem } from '../lib/api';
import { cn } from '../lib/utils';

export type BotState = 'pending' | 'reviewing' | 'deepening' | 'deepen-queued' | 'testing' | 'qa-queued' | 'failed' | 'skipped' | 'up_to_date' | undefined;

// What the bot is doing with this review, shown before the verdict so live
// work is visible at a glance: running, waiting, or broken.
export function TabIcon({ item, bot }: { item: ReviewItem; bot: BotState }) {
  if (bot === 'reviewing' || bot === 'deepening' || bot === 'testing') return <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-pulse text-blue-500" role="img" aria-label="Review in progress" />;
  if (bot === 'failed') return <AlertTriangle className="size-4 shrink-0 text-orange-500" role="img" aria-label="Review failed" />;
  if (bot === 'pending') return <Clock className="size-4 shrink-0 text-fg-subtle" role="img" aria-label="Waiting for review" />;
  const { Icon, cls } = VERDICT_ICON[item.verdict ?? 'OTHER'];
  return <Icon className={cn('size-4 shrink-0', cls)} aria-hidden />;
}

