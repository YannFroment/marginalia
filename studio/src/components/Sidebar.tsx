import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { TabIcon } from './TabIcon';
import type { BotState } from './TabStrip';

interface Group {
  id: string;
  label: string;
  items: ReviewItem[];
}

// Navigation / history: every review, grouped by what needs attention. Meant
// to be tucked away; the open reviews live in the tabs.
export function Sidebar({ items, activeSlug, botBySlug, isUnread, open, onSelect, onClose }: {
  items: ReviewItem[];
  activeSlug: string | null;
  botBySlug: Map<string, BotState>;
  isUnread: (i: ReviewItem) => boolean;
  open: boolean;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (i: ReviewItem) => !q || `${i.iid ?? ''} ${i.title} ${i.branch ?? ''} ${i.author ?? ''} ${i.slug}`.toLowerCase().includes(q);
    const f = items.filter(match);
    return [
      { id: 'changes', label: 'Needs changes', items: f.filter((i) => i.kind === 'review' && i.verdict === 'REQUEST_CHANGES') },
      { id: 'approved', label: 'Approved', items: f.filter((i) => i.kind === 'review' && i.verdict === 'APPROVE') },
      { id: 'unrated', label: 'Unrated', items: f.filter((i) => i.kind === 'review' && i.verdict !== 'APPROVE' && i.verdict !== 'REQUEST_CHANGES') },
      { id: 'triage', label: 'Triage', items: f.filter((i) => i.kind === 'comments') },
      { id: 'retro', label: 'Retro', items: f.filter((i) => i.kind === 'retro') },
    ].filter((g) => g.items.length > 0);
  }, [items, query]);

  return (
    <>
      {open && <div className="fixed inset-x-0 bottom-0 top-[var(--chrome-h)] z-20 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        aria-label="All reviews"
        aria-hidden={!open}
        className={cn(
          'z-30 shrink-0 overflow-hidden border-zinc-200 bg-zinc-50 transition-[width,border-color] duration-300 ease-out dark:border-zinc-800 dark:bg-zinc-950',
          'fixed bottom-0 left-0 top-[var(--chrome-h)] lg:sticky lg:top-[var(--chrome-h)] lg:h-[calc(100vh-var(--chrome-h))] lg:self-start',
          open ? 'w-72 border-r' : 'w-0 border-r-0',
        )}
      >
        <div className="flex h-full w-72 flex-col">
          <div className="p-3">
            <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/50 dark:border-zinc-800 dark:bg-zinc-900">
              <Search className="size-4 shrink-0 text-fg-subtle" />
              <input
                aria-label="Filter reviews"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter reviews…"
                tabIndex={open ? 0 : -1}
                className="touch-target min-h-8 w-full bg-transparent py-1.5 outline-none placeholder:text-fg-muted"
              />
            </label>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {groups.length === 0 && <p className="px-2 py-6 text-center text-sm text-fg-muted">No reviews match.</p>}
            {groups.map((g) => (
              <section key={g.id} className="mb-2">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                  tabIndex={open ? 0 : -1}
                  className="flex w-full items-center gap-1 rounded px-2 py-1 text-xs font-medium uppercase tracking-wide text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <ChevronRight className={cn('size-3.5 transition-transform', !collapsed[g.id] && 'rotate-90')} />
                  {g.label}
                  <span className="ml-auto font-normal normal-case tracking-normal">{g.items.length}</span>
                </button>
                {!collapsed[g.id] && (
                  <ul>
                    {g.items.map((item) => {
                      const active = item.slug === activeSlug;
                      return (
                        <li key={item.slug}>
                          <a
                            href={`#/${item.slug}`}
                            aria-current={active ? 'page' : undefined}
                            tabIndex={open ? 0 : -1}
                            onClick={(e) => {
                              e.preventDefault();
                              onSelect(item.slug);
                              if (window.matchMedia('(max-width: 1023px)').matches) onClose();
                            }}
                            className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm', active ? 'bg-zinc-200/70 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900')}
                          >
                            <span className="mt-0.5"><TabIcon item={item} bot={botBySlug.get(item.slug)} /></span>
                            <span className="min-w-0 flex-1">
                              <span className={cn('line-clamp-2 leading-snug', isUnread(item) && 'font-medium')}>{item.title}{isUnread(item) && <span className="sr-only"> (unread)</span>}</span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                                {item.iid && <span className="font-mono">!{item.iid}</span>}
                                <span>{timeAgo(item.reviewedAt)}</span>
                              </span>
                            </span>
                            {isUnread(item) && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" aria-hidden />}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
