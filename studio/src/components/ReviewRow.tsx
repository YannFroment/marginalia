import { ExternalLink, GitBranch } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { standingOf } from '../lib/dashboard';
import { timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { RiskBadge } from './RiskBadge';
import { VerdictBadge } from './VerdictBadge';

// Where I stand on the MR, from GitLab (see standingOf).
function StandingBadge({ item }: { item: ReviewItem }) {
  const standing = item.myState ? standingOf(item.kind, item.myState) : null;
  return standing ? <Badge tone={standing.tone}>{standing.label}</Badge> : null;
}

// One review per line: the title opens it; author, findings and age say how urgent it is.
export function ReviewRow({ item, unread }: { item: ReviewItem; unread: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white px-4 py-3 text-sm hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60">
      <span className={unread ? 'size-2 shrink-0 rounded-full bg-blue-500' : 'size-2 shrink-0'} aria-hidden />
      <a href={`#/${item.slug}`} className="min-w-0 flex-1 basis-64 truncate font-medium hover:underline">
        {item.iid && <span className="mr-2 font-mono text-xs text-fg-muted">!{item.iid}</span>}
        {item.title}
        {unread && <span className="sr-only"> (unread)</span>}
      </a>
      {item.author && <span className="max-w-[9rem] truncate text-xs text-fg-muted">{item.author}</span>}
      {item.branch && (
        <span className="hidden min-w-0 max-w-[14rem] items-center gap-1 truncate font-mono text-xs text-fg-muted 2xl:inline-flex">
          <GitBranch className="size-3.5 shrink-0" aria-hidden />{item.branch}
        </span>
      )}
      {(item.critical > 0 || item.important > 0) && (
        <span className="flex gap-2 text-xs tabular-nums">
          {item.critical > 0 && <span className="text-red-700 dark:text-red-300">{item.critical} critical</span>}
          {item.important > 0 && <span className="text-amber-700 dark:text-amber-300">{item.important} important</span>}
        </span>
      )}
      <StandingBadge item={item} />
      <RiskBadge level={item.risk ?? null} />
      <VerdictBadge verdict={item.verdict} />
      <span className="w-20 shrink-0 whitespace-nowrap text-right text-xs text-fg-muted">{timeAgo(item.reviewedAt)}</span>
    </li>
  );
}
