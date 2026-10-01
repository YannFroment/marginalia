import { ExternalLink, GitBranch } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { VerdictBadge } from './VerdictBadge';

// One review per line, for scanning many MRs: the title opens the review, the
// ticket opens Jira on its own, to check it before reading the review.
export function ReviewRow({ item, unread, jiraUrl = null }: { item: ReviewItem; unread: boolean; jiraUrl?: string | null }) {
  const ticket = item.jira?.priority ? item.jira.key : null;
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
      {ticket && jiraUrl ? (
        <a href={`${jiraUrl}/browse/${ticket}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-zinc-500/10 px-1.5 py-0.5 text-xs hover:bg-zinc-500/20">
          {ticket}<span className="text-fg-muted">· {item.jira?.priority}</span><ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        <span className="text-xs text-fg-muted">No ticket</span>
      )}
      <VerdictBadge verdict={item.verdict} />
    </li>
  );
}
