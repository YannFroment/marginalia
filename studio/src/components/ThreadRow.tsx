import { Check, MessageSquare } from 'lucide-react';
import type { Thread } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { NoteMarkdown } from './NoteMarkdown';

// One GitLab thread as it reads in the diff: who said what, in order, and whether it is settled.
export function ThreadCard({ thread, showPlace }: { thread: Thread; showPlace?: boolean }) {
  const settled = thread.resolved;
  return (
    <div className={cn('rounded-md border px-3 py-2 font-sans text-sm', settled ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900' : 'border-violet-500/30 bg-violet-500/5')}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <MessageSquare className="size-3.5" aria-hidden />
        <span>{thread.notes.length === 1 ? 'Comment' : `${thread.notes.length} comments`}</span>
        {showPlace && thread.line != null && <code>line {thread.line}</code>}
        {settled && <Badge tone="success"><Check className="mr-1 size-3" aria-hidden />Resolved</Badge>}
        {thread.outdated && <Badge tone="neutral">Earlier version</Badge>}
      </div>
      <ul className="space-y-2">
        {thread.notes.map((n) => (
          <li key={n.id}>
            <p className="text-xs text-fg-muted"><span className="font-medium text-fg">{n.mine ? 'You' : n.authorName ?? n.author}</span> · {timeAgo(n.at)}</p>
            <NoteMarkdown className={cn(settled && 'opacity-70')}>{n.body}</NoteMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A table row carrying a thread under the line it is about.
export function ThreadRow({ thread }: { thread: Thread }) {
  return (
    <tr>
      <td colSpan={3} className="px-3 py-1.5"><ThreadCard thread={thread} /></td>
    </tr>
  );
}
