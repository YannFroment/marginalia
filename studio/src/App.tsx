import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { Inbox, LayoutGrid, Grid3x3, List, Rows3 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { loadSeen, saveSeen, useMarkdown, useReviews, type ReviewItem } from './lib/api';
import { usePersistentState, useOpenTabs } from './lib/layout';
import { cn } from './lib/utils';
import { StatusBar } from './components/StatusBar';
import { TabStrip, type BotState } from './components/TabStrip';
import { Sidebar } from './components/Sidebar';
import { StatStrip, type Filter } from './components/StatStrip';
import { ReviewCard, type CardSize } from './components/ReviewCard';
import { ReviewRow } from './components/ReviewRow';
// Not needed on Home, and the heaviest part of the bundle (markdown, highlighting, semfont).
const loadReader = () => import('./components/ReviewReader');
const ReviewReader = lazy(() => loadReader().then((m) => ({ default: m.ReviewReader })));
import { CommandPalette } from './components/CommandPalette';
import { StackBoard } from './components/StackBoard';

const EMPTY_POSTED = {};
// Reviews older than this are hidden from the Home grid and its counters.
const STALE_DAYS = 30;
const SIZE_KEY = 'mr-review-viewer:card-size';
// "list": one line per review (title, branch, verdict), for scanning many MRs.
type Layout = CardSize | 'list';
const SIZES: { value: Layout; label: string; Icon: typeof Grid3x3 }[] = [
  { value: 'small', label: 'Small cards', Icon: Grid3x3 },
  { value: 'medium', label: 'Medium cards', Icon: LayoutGrid },
  { value: 'large', label: 'Large cards', Icon: Rows3 },
  { value: 'list', label: 'List', Icon: List },
];
const GRID: Record<CardSize, string> = {
  small: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  medium: 'sm:grid-cols-2 lg:grid-cols-3',
  large: 'lg:grid-cols-2',
};
function loadSize(): Layout {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return v === 'small' || v === 'large' || v === 'list' ? v : 'medium';
  } catch {
    return 'medium';
  }
}

type Tab = 'review' | 'comments';

function useHashSlug() {
  const read = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')) || null;
  const [slug, setSlug] = useState(read);
  useEffect(() => {
    const on = () => setSlug(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return slug;
}

export function App() {
  const { data, error, reload } = useReviews();
  const slug = useHashSlug();
  const [palette, setPalette] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('review');
  const [seen, setSeen] = useState(loadSeen);
  const [size, setSizeState] = useState<Layout>(loadSize);
  // Tucked away by default: the tabs are the working set, the sidebar is history.
  const [sidebarPref, setSidebarOpen] = usePersistentState('mr-review-viewer:sidebar-open', false);

  // True for the length of the resize animation, so only then do cards scale.
  const [resizing, setResizing] = useState(false);
  const resizeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resizeTimer.current), []);

  const setSize = (next: Layout) => {
    setResizing(true);
    clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => setResizing(false), 600);
    setSizeState(next);
    try {
      localStorage.setItem(SIZE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  // One persistent toast while the API is unreachable, dismissed once it's back.
  useEffect(() => {
    if (error) toast.error('Studio API unreachable', { id: 'api-error', description: error, duration: Infinity });
    else toast.dismiss('api-error');
  }, [error]);

  // Fetch the reader in the background once Home is up, so the first review opens instantly.
  useEffect(() => {
    const t = setTimeout(() => void loadReader(), 1200);
    return () => clearTimeout(t);
  }, []);

  // Home is the list (card grid), so the sidebar only exists while reading a
  // review. The stored preference is kept and comes back on the next review.
  const sidebarAvailable = slug !== null;
  const sidebarOpen = sidebarPref && sidebarAvailable;

  const items = data?.items ?? [];
  const known = useMemo(() => (data ? new Set(data.items.map((i) => i.slug)) : null), [data]);
  const { tabs: openSlugs, close: closeTab } = useOpenTabs(slug, known);
  const tabItems = openSlugs.map((s) => items.find((i) => i.slug === s)).filter((i): i is ReviewItem => Boolean(i));
  // Live bot state per review, from status.json (mr.reviewPath -> slug).
  const botBySlug = useMemo(() => {
    const m = new Map<string, BotState>();
    for (const mr of data?.status?.mrs ?? []) {
      const file = mr.reviewPath?.split('/').pop();
      if (file) m.set(file.replace(/\.md$/, ''), mr.status as BotState);
    }
    return m;
  }, [data]);
  const isPosted = (i: ReviewItem) => Object.keys(data?.posted ?? {}).some((k) => k.startsWith(`${i.slug}:`));
  const current = items.find((i) => i.slug === slug);
  const stack = current?.stackId ? data?.stacks.find((s) => s.id === current.stackId) : undefined;
  const markdown = useMarkdown(slug, current?.reviewedAt);

  useEffect(() => {
    if (!current) return;
    setSeen((prev) => {
      if (prev[current.slug] === current.reviewedAt) return prev;
      const next = { ...prev, [current.slug]: current.reviewedAt };
      saveSeen(next);
      return next;
    });
  }, [current]);

  const isUnread = (i: ReviewItem) => seen[i.slug] !== i.reviewedAt;

  // ⌘B toggles the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (sidebarAvailable) setSidebarOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSidebarOpen, sidebarAvailable]);
  const go = (s: string | null) => {
    location.hash = s ? `#/${s}` : '';
    window.scrollTo({ top: 0 });
  };
  const close = (s: string) => {
    const next = closeTab(s);
    if (s === slug) go(next);
  };

  // Physical key that types "w" on the current layout (AZERTY: KeyZ), used
  // for Option combos where e.key is a symbol. Chromium only; else e.key alone.
  const wCode = useRef<string | null>(null);
  useEffect(() => {
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    kb?.getLayoutMap?.().then((map) => {
      for (const [code, ch] of map) if (ch === 'w') wCode.current = code;
    }).catch(() => {});
  }, []);

  // Close the active review tab like a browser tab. ⌘W is reserved by the
  // browser (a page never receives it), so the working shortcuts are Ctrl+W,
  // ⌥W and ⌘⌥W; plain ⌘W is handled too in case it is ever delivered. The "W"
  // is the character typed, not the physical position, so it also works on
  // AZERTY (where that key sits where QWERTY has Z). Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isW = e.key.toLowerCase() === 'w' || e.key === '∑' || (wCode.current !== null && e.code === wCode.current);
      if (!isW || e.shiftKey || !(e.ctrlKey || e.metaKey || e.altKey) || !slug) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (palette || document.querySelector('[role=dialog]')) return;
      e.preventDefault();
      close(slug);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Old MRs are noise on Home; they stay reachable from the sidebar, tabs and palette.
  const fresh = useMemo(() => items.filter((i) => Date.now() - new Date(i.reviewedAt).getTime() < STALE_DAYS * 86_400_000), [items]);

  const visible = useMemo(() => {
    return fresh.filter((i) => {
      if (i.kind !== tab) return false;
      if (filter === 'changes') return i.verdict === 'REQUEST_CHANGES';
      if (filter === 'unread') return isUnread(i);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, tab, filter, seen]);

  // Unread first, then already-read, each under a heading so a long queue
  // shows at a glance what still needs a look. Stable sort keeps the API order.
  const ordered = useMemo(() => [...visible.filter(isUnread), ...visible.filter((i) => !isUnread(i))], [visible, seen]);
  const unreadVisible = ordered.filter(isUnread).length;
  const sectioned = unreadVisible > 0 && unreadVisible < ordered.length;

  const unreadCount = fresh.filter((i) => i.kind !== 'retro' && isUnread(i)).length;

  // Counters follow the selected tab (Reviews / Triage).
  const scoped = fresh.filter((i) => i.kind === tab);
  const counts = {
    changes: scoped.filter((i) => i.verdict === 'REQUEST_CHANGES').length,
    unread: scoped.filter(isUnread).length,
  };
  const tileKeys = tab === 'review' ? (['changes', 'unread'] as const) : (['unread'] as const);

  return (
    // reducedMotion="user": no layout animation if the OS asks for less motion.
    <MotionConfig reducedMotion="user">
      <Toaster position="bottom-right" theme="system" richColors closeButton />
      <header className="sticky top-0 z-40 bg-zinc-50/90 backdrop-blur dark:bg-zinc-950/90">
        <StatusBar status={data?.status ?? null} pollMinutes={data?.settings.pollIntervalMinutes ?? null} onOpenPalette={() => setPalette(true)} onHome={() => go(null)} />
        <TabStrip
          tabs={tabItems}
          activeSlug={slug}
          botBySlug={botBySlug}
          isUnread={isUnread}
          isPosted={isPosted}
          homeUnread={unreadCount}
          sidebarOpen={sidebarOpen}
          sidebarAvailable={sidebarAvailable}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onSelect={go}
          onClose={close}
        />
      </header>
      <CommandPalette open={palette} setOpen={setPalette} items={items} onSelect={go} />

      <div className="flex">
        <Sidebar items={items} activeSlug={slug} botBySlug={botBySlug} isUnread={isUnread} open={sidebarOpen} onSelect={go} onClose={() => setSidebarOpen(false)} />
        <main className="min-w-0 flex-1">
      {slug ? (
        <>
        {stack && current && <StackBoard stack={stack} items={items} current={current} isPosted={isPosted} onSelect={go} />}
        <Suspense fallback={<p className="px-6 py-6 text-fg-muted">Loading…</p>}>
        <ReviewReader item={current} markdown={markdown} projectUrl={data?.projectUrl ?? null} allowPosting={data?.allowPosting ?? false} postDryRun={data?.postDryRun ?? false} deepenEnabled={data?.deepenEnabled ?? false} botState={current ? botBySlug.get(current.slug) : undefined} live={current && data?.status?.current && String(data.status.current.iid) === String(current.iid) ? data.status.current : null} posted={data?.posted ?? EMPTY_POSTED} reload={reload} />
        </Suspense>
        </>
      ) : (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <h1 className="text-3xl font-semibold tracking-tight">Review queue</h1>
          <p className="mt-1 text-fg-muted">Open merge requests, reviewed by the bot.{data && !data.allowPosting && ' Read-only: nothing is posted to GitLab.'}</p>


          <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
            {(['review', 'comments'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setFilter('all');
                }}
                className={cn('touch-target rounded-lg px-3 py-1.5 text-sm', tab === t ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}
              >
                {t === 'review' ? 'Reviews' : 'Triage'}
              </button>
            ))}
            <div role="radiogroup" aria-label="Card size" className="ml-auto flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
              {SIZES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={size === value}
                  aria-label={label}
                  title={label}
                  onClick={() => setSize(value)}
                  className={cn('touch-target flex items-center justify-center rounded-md p-1.5 transition-colors', size === value ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-fg-muted hover:bg-zinc-100 dark:hover:bg-zinc-800')}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>

          <StatStrip counts={counts} keys={[...tileKeys]} active={filter} onChange={setFilter} />

          {data && visible.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-fg-muted"><Inbox className="size-8" />No reviews match this filter.</div>
          ) : size === 'list' ? (
            <ul className="mt-6 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {ordered.map((i) => <ReviewRow key={i.slug} item={i} unread={isUnread(i)} />)}
            </ul>
          ) : (
            <div className={cn('mt-6 grid', size === 'small' ? 'gap-3' : 'gap-4', GRID[size])}>
                {ordered.flatMap((i, idx) => [
                  ...(sectioned && (idx === 0 || idx === unreadVisible)
                    ? [
                        <motion.h2 key={idx === 0 ? 'h-unread' : 'h-read'} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('col-span-full text-xs font-medium uppercase tracking-wide text-fg-muted', idx !== 0 && 'mt-4')}>
                          {idx === 0 ? `To review · ${unreadVisible}` : `Already read · ${ordered.length - unreadVisible}`}
                        </motion.h2>,
                      ]
                    : []),
                  <ReviewCard key={i.slug} item={i} unread={isUnread(i)} size={size} resizing={resizing} />,
                ])}
            </div>
          )}
        </div>
      )}
        </main>
      </div>
    </MotionConfig>
  );
}
