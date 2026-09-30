import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, GitBranch, User } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { VerdictBadge } from './VerdictBadge';

export type CardSize = 'small' | 'medium' | 'large';

// Layout animations run on transforms (GPU), so a size change or a re-flow of
// the grid glides instead of jumping. `layout="position"` on the content keeps
// text from being stretched while the card box scales around it.
const LAYOUT = { duration: 0.5, ease: [0.4, 0, 0.2, 1] } as const;
const SEVERITY_DOT = { critical: 'bg-red-500', important: 'bg-amber-500' } as const;

// Extra content that fades in/out; popLayout takes a leaving block out of the
// flow right away so the card can start resizing while it fades.
const reveal = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22, ease: 'easeOut', delay: 0.26 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
} as const;

export function ReviewCard({ item, unread, size }: { item: ReviewItem; unread: boolean; size: CardSize }) {
  const small = size === 'small';
  const large = size === 'large';
  return (
    <motion.a
      layout
      transition={LAYOUT}
      href={`#/${item.slug}`}
      // Set through style so the radius is corrected while the box scales.
      style={{ borderRadius: 12 }}
      className={cn(
        'group relative flex flex-col overflow-hidden border border-zinc-200 bg-white transition-colors hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
        small ? 'gap-1.5 p-3' : 'gap-3 p-4',
      )}
    >
      {unread && <span className={cn('absolute size-2 rounded-full bg-blue-500', small ? 'right-2.5 top-2.5' : 'right-3 top-3')} aria-hidden />}

      <motion.div layout="position" transition={LAYOUT} className="flex items-center gap-2 text-xs text-fg-muted">
        {item.iid && <span className="font-mono">!{item.iid}</span>}
        {item.kind === 'comments' && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-700 dark:text-violet-300">triage</span>}
        <span>{timeAgo(item.reviewedAt)}</span>
      </motion.div>

      <motion.h2 layout="position" transition={LAYOUT} className={cn('font-medium leading-snug', small ? 'line-clamp-2 text-xs' : large ? 'text-base' : 'line-clamp-2 text-sm')}>{item.title}{unread && <span className="sr-only"> (unread)</span>}</motion.h2>

      <AnimatePresence initial={false} mode="popLayout">
        {large && (
          <motion.div key="details" layout="position" {...reveal} className="space-y-3">
            {item.branch && (
              <div className="flex items-center gap-1.5 font-mono text-xs text-fg-muted">
                <GitBranch className="size-3.5 shrink-0" /><span className="truncate">{item.branch}</span>
              </div>
            )}
            {item.summary && <p className="line-clamp-4 text-sm leading-relaxed text-fg-muted">{item.summary}</p>}
            {item.highlights.length > 0 && (
              <ul className="space-y-1.5">
                {item.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-snug text-fg-muted">
                    <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', SEVERITY_DOT[h.severity])} title={h.severity} />
                    <span className="line-clamp-2">{h.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout="position" transition={LAYOUT} className="mt-auto flex flex-wrap items-center gap-1.5">
        <VerdictBadge verdict={item.verdict} compact={small} />
        {item.critical > 0 && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">{item.critical}{!small && ' critical'}</span>}
        {item.important > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">{item.important}{!small && ' important'}</span>}
      </motion.div>

      <AnimatePresence initial={false} mode="popLayout">
        {!small && (
          <motion.div key="footer" layout="position" {...reveal} className="flex items-center justify-between text-xs text-fg-muted">
            <span className="flex items-center gap-1 truncate">{item.author && <><User className="size-3" />{item.author}</>}</span>
            <span className={cn('flex items-center gap-0.5 font-medium text-zinc-700 transition-opacity dark:text-zinc-300', large ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>Open<ArrowUpRight className="size-3.5" /></span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.a>
  );
}
