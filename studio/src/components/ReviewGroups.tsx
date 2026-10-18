import { ChevronRight } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import type { Group } from '../lib/dashboard';
import { cn } from '../lib/utils';
import { ReviewRow } from './ReviewRow';

function Heading({ group }: { group: Group }) {
  return (
    <>
      <span className="font-medium">{group.title}</span>
      <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', group.needsYou ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-zinc-500/10 text-fg-muted')}>{group.items.length}</span>
      <span className="hidden text-xs font-normal text-fg-muted sm:inline">{group.hint}</span>
    </>
  );
}

function List({ group, isUnread }: { group: Group; isUnread: (i: ReviewItem) => boolean }) {
  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {group.items.map((i) => <ReviewRow key={i.slug} item={i} unread={isUnread(i)} />)}
    </ul>
  );
}

// The reviews grouped by whose turn it is. What waits on you comes first; what is done is folded.
export function ReviewGroups({ groups, isUnread }: { groups: Group[]; isUnread: (i: ReviewItem) => boolean }) {
  return (
    <div className="mt-6 space-y-8">
      {groups.map((g) => (g.collapsed ? (
        <details key={g.id} className="group">
          <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm">
            <ChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            <Heading group={g} />
          </summary>
          <List group={g} isUnread={isUnread} />
        </details>
      ) : (
        <section key={g.id} aria-label={g.title}>
          <h2 className="mb-3 flex items-center gap-2 text-sm"><Heading group={g} /></h2>
          <List group={g} isUnread={isUnread} />
        </section>
      )))}
    </div>
  );
}
