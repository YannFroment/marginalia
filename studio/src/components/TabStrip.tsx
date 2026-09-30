import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, LayoutGrid, PanelLeft, X } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { cn } from '../lib/utils';
import { TabIcon, VERDICT_ICON, type BotState } from './TabIcon';

export type { BotState };

interface Props {
  tabs: ReviewItem[];
  activeSlug: string | null;
  botBySlug: Map<string, BotState>;
  isUnread: (i: ReviewItem) => boolean;
  isPosted: (i: ReviewItem) => boolean;
  homeUnread: number;
  sidebarOpen: boolean;
  // False on Home, where the card grid already lists every review.
  sidebarAvailable: boolean;
  onToggleSidebar: () => void;
  onSelect: (slug: string | null) => void;
  onClose: (slug: string) => void;
}

export function TabStrip({ tabs, activeSlug, botBySlug, isUnread, isPosted, homeUnread, sidebarOpen, sidebarAvailable, onToggleSidebar, onSelect, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <nav aria-label="Open reviews" className="flex h-10 items-stretch border-b border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/40">
      <button
        onClick={onToggleSidebar}
        disabled={!sidebarAvailable}
        aria-pressed={sidebarOpen}
        aria-label="Toggle sidebar"
        title={sidebarAvailable ? 'Toggle sidebar (⌘B)' : 'Home already lists every review'}
        className={cn('flex w-11 shrink-0 items-center justify-center border-r border-zinc-200 dark:border-zinc-800', !sidebarAvailable ? 'text-zinc-300 dark:text-zinc-700' : sidebarOpen ? 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100' : 'text-fg-muted hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60')}
      >
        <PanelLeft className="size-4" />
      </button>

      <ul className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li className="flex shrink-0">
        <a
          href="#/"
          aria-current={activeSlug === null ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            onSelect(null);
          }}
          className={cn('flex shrink-0 items-center gap-2 border-r border-t-2 border-zinc-200 px-3 text-sm dark:border-zinc-800', activeSlug === null ? 'border-t-blue-500 bg-white font-medium dark:bg-zinc-950' : 'border-t-transparent text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800/60')}
        >
          <LayoutGrid className="size-4" />
          Reviews
          {homeUnread > 0 && <span className="rounded-full bg-blue-500/15 px-1.5 text-xs text-blue-700 dark:text-blue-300">{homeUnread}<span className="sr-only"> unread</span></span>}
        </a>
        </li>

        <AnimatePresence initial={false}>
        {tabs.map((item) => {
          const active = item.slug === activeSlug;
          const unread = isUnread(item);
          const accent = VERDICT_ICON[item.verdict ?? 'OTHER'].accent;
          return (
            <motion.li
              key={item.slug}
              // A new tab grows in and a closed one shrinks away while its
              // siblings give up/take back the space, like a browser.
              initial={{ flexBasis: '0rem', minWidth: '0rem', opacity: 0 }}
              animate={{ flexBasis: '14rem', minWidth: active ? '4.5rem' : '2.25rem', opacity: 1 }}
              exit={{ flexBasis: '0rem', minWidth: '0rem', opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(item.slug);
                }
              }}
              // Like a browser: tabs start at 14rem and all shrink together as more open; below ~96px the title hides (icon only), and the active tab keeps room for its close button.
              className={cn('@container group relative flex shrink grow-0 items-stretch overflow-hidden border-r border-t-2 border-zinc-200 dark:border-zinc-800', active ? cn('bg-white dark:bg-zinc-950', accent) : 'border-t-transparent hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60')}
            >
              <a
                href={`#/${item.slug}`}
                title={item.title}
                aria-current={active ? 'page' : undefined}
                aria-label={`${item.iid ? `!${item.iid} ` : ''}${item.title}${unread ? ' (unread)' : ''}${isPosted(item) ? ' (comment posted)' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(item.slug);
                }}
                className={cn('flex min-w-0 flex-1 items-center justify-center gap-2 text-sm @min-[96px]:justify-start @min-[96px]:pl-3 @min-[96px]:pr-1', active ? 'pl-3 font-medium' : 'text-fg-muted')}
              >
                <span className="relative flex shrink-0">
                  <TabIcon item={item} bot={botBySlug.get(item.slug)} />
                  {/* Icon-only tabs have no room for the unread indicator, so it moves onto the icon. */}
                  {unread && !active && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-blue-500 ring-2 ring-zinc-100 @min-[96px]:hidden dark:ring-zinc-900" aria-hidden />}
                </span>
                <span className="hidden min-w-0 truncate @min-[96px]:block">
                  {item.iid && <span className="mr-1.5 hidden font-mono text-xs text-fg-muted @min-[150px]:inline">!{item.iid}</span>}
                  {item.title}
                </span>
              </a>
              <span className={cn('w-7 shrink-0 items-center justify-center', active ? 'flex' : 'hidden @min-[96px]:flex')}>
                {isPosted(item) && <Check className="size-3.5 text-emerald-600 group-hover:hidden dark:text-emerald-400" aria-hidden />}
                {unread && !isPosted(item) && <span className="size-2 rounded-full bg-blue-500 group-hover:hidden" aria-hidden />}
                <button
                  onClick={() => onClose(item.slug)}
                  aria-label={`Close ${item.title}`}
                  title="Close tab (Ctrl+W or ⌥W)"
                  className={cn('hidden size-5 items-center justify-center rounded hover:bg-zinc-300/70 group-hover:flex dark:hover:bg-zinc-700', active && !isPosted(item) && !unread && 'flex')}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </motion.li>
          );
        })}
        </AnimatePresence>
      </ul>
    </nav>
  );
}
