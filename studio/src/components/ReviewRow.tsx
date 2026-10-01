import { GitBranch } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { VerdictBadge } from './VerdictBadge';

// One review per line, for scanning many MRs: the title opens the review.
export function ReviewRow({ item, unread }: { item: ReviewItem; unread: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white px-4 py-3 text-sm hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60">
      <span className={unread ? 'size-2 shrink-0 rounded-full bg-blue-500' : 'size-2 shrink-0'} aria-hidden />
      <a href={`#/${item.slug}`} className="min-w-0 flex-1 basis-64 truncate font-medium hover:underline">
        {item.iid && <span className="mr-2 font-mono text-xs text-fg-muted">!{item.iid}</span>}
        {item.title}
        {unread && <span className="sr-only"> (unread)</span>}
      </a>
      {item.branch && (
        <span className="inline-flex min-w-0 max-w-xs items-center gap-1 truncate font-mono text-xs text-fg-muted">
          <GitBranch className="size-3.5 shrink-0" aria-hidden />{item.branch}
        </span>
      )}
      <VerdictBadge verdict={item.verdict} />
    </li>
  );
}
