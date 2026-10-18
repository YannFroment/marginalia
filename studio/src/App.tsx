import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { Inbox } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { loadSeen, saveSeen, useReview, useReviews, useTickets, type ReviewItem } from './lib/api';
import { groupReviews, waitingOnYou } from './lib/dashboard';
import { usePersistentState, useOpenTabs } from './lib/layout';
import { cn } from './lib/utils';
import { StatusBar } from './components/StatusBar';
import { TabStrip, type BotState } from './components/TabStrip';
import { Sidebar } from './components/Sidebar';
import { ReviewGroups } from './components/ReviewGroups';
// Not needed on Home, and the heaviest part of the bundle (markdown, highlighting).
const loadReader = () => import('./components/ReviewReader');
const ReviewReader = lazy(() => loadReader().then((m) => ({ default: m.ReviewReader })));
import { CommandPalette } from './components/CommandPalette';
import { SettingsPage } from './components/SettingsPage';
import { StackBoard } from './components/StackBoard';
import { ReviewMissing, ReviewSkeleton } from './components/ReviewSkeleton';
import { TicketsBoard } from './components/TicketsBoard';

const EMPTY_POSTED = {};
// `#/settings` is the settings page, not a review.
const SETTINGS_ROUTE = 'settings';
// `#/tickets` is the Jira tickets page.
const TICKETS_ROUTE = 'tickets';
// Reviews older than this are hidden from Home.
const STALE_DAYS = 30;
// The animation features load after the first paint; until then `m` components just render.
const loadMotionFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default);

// Reviews and, when the Tickets tab is configured, Jira tickets.
function HomeNav({ active }: { active: 'reviews' | 'tickets' }) {
  const link = (id: 'reviews' | 'tickets', href: string, label: string) => (
    <a href={href} aria-current={active === id ? 'page' : undefined} className={cn('touch-target rounded-lg px-3 py-1.5 text-sm', active === id ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}>{label}</a>
  );
  return <nav aria-label="Pages" className="flex gap-2">{link('reviews', '#', 'Reviews')}{link('tickets', `#/${TICKETS_ROUTE}`, 'Tickets')}</nav>;
}

function useHashSlug() {
  // A malformed escape (`#/%E0%A4`) makes decodeURIComponent throw: treat it as no review.
  const read = () => {
    try {
      return decodeURIComponent(location.hash.replace(/^#\/?/, '')) || null;
    } catch {
      return null;
    }
  };
  const [slug, setSlug] = useState(read);
  useEffect(() => {
    const on = () => setSlug(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return slug;
}

// Which reviews were read, at which version. Opening a review marks it as read; saved here,
// not inside a state updater.
function useSeen(current: ReviewItem | undefined) {
  const [seen, setSeen] = useState(loadSeen);
  useEffect(() => {
    if (!current || seen[current.slug] === current.reviewedAt) return;
    const next = { ...seen, [current.slug]: current.reviewedAt };
    saveSeen(next);
    setSeen(next);
  }, [current, seen]);
  const isUnread = useCallback((i: ReviewItem) => seen[i.slug] !== i.reviewedAt, [seen]);
  return { isUnread };
}

// ⌘B toggles the sidebar.
function useSidebarShortcut(available: boolean, setOpen: (update: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (available) setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen, available]);
}

// Close the active review tab like a browser tab. ⌘W is reserved by the browser (a page never
// receives it), so the working shortcuts are Ctrl+W, ⌥W and ⌘⌥W; plain ⌘W is handled too in case
// it is ever delivered. The "W" is the character typed, not the physical position, so it also works
// on AZERTY (where that key sits where QWERTY has Z). Ignored while typing.
function useCloseTabShortcut(slug: string | null, palette: boolean, close: (slug: string) => void) {
  // Physical key that types "w" on the current layout (AZERTY: KeyZ), used
  // for Option combos where e.key is a symbol. Chromium only; else e.key alone.
  const wCode = useRef<string | null>(null);
  useEffect(() => {
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    kb?.getLayoutMap?.().then((map) => {
      for (const [code, ch] of map) if (ch === 'w') wCode.current = code;
    }).catch(() => {});
  }, []);
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
}

// What Home lists: the recent reviews, grouped by whose turn it is on GitLab.
function useHomeGroups(items: ReviewItem[]) {
  return useMemo(() => {
    // Old MRs are noise on Home; they stay reachable from the sidebar, tabs and palette.
    const fresh = items.filter((i) => Date.now() - new Date(i.reviewedAt).getTime() < STALE_DAYS * 86_400_000);
    return groupReviews(fresh);
  }, [items]);
}

export function App() {
  const { data, error, reload } = useReviews();
  const slug = useHashSlug();
  const [palette, setPalette] = useState(false);
  // Tucked away by default: the tabs are the working set, the sidebar is history.
  const [sidebarPref, setSidebarOpen] = usePersistentState('mr-review-viewer:sidebar-open', false);

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

  // Home is the list, so the sidebar only exists while reading a
  // review. The stored preference is kept and comes back on the next review.
  const sidebarAvailable = slug !== null && slug !== TICKETS_ROUTE;
  const sidebarOpen = sidebarPref && sidebarAvailable;

  const items = useMemo(() => data?.items ?? [], [data]);
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
  const { content: review, error: reviewError, retry: retryReview } = useReview(slug === SETTINGS_ROUTE || slug === TICKETS_ROUTE ? null : slug, current?.reviewedAt);
  const tickets = useTickets(slug === TICKETS_ROUTE);

  const { isUnread } = useSeen(current);
  const groups = useHomeGroups(items);
  const waiting = waitingOnYou(groups);

  useSidebarShortcut(sidebarAvailable, setSidebarOpen);
  const go = (s: string | null) => {
    location.hash = s ? `#/${s}` : '';
    window.scrollTo({ top: 0 });
  };
  const close = (s: string) => {
    const next = closeTab(s);
    if (s === slug) go(next);
  };

  useCloseTabShortcut(slug, palette, close);

  return (
    // reducedMotion="user": no layout animation if the OS asks for less motion.
    <MotionConfig reducedMotion="user">
    <LazyMotion features={loadMotionFeatures} strict>
      <Toaster position="bottom-right" theme="system" richColors />
      <header className="sticky top-0 z-40 bg-zinc-50/90 backdrop-blur dark:bg-zinc-950/90">
        <StatusBar status={data?.status ?? null} connection={data ? 'ok' : error ? 'unreachable' : 'connecting'} settingsActive={slug === SETTINGS_ROUTE} onOpenPalette={() => setPalette(true)} onHome={() => go(null)} onSettings={() => go(SETTINGS_ROUTE)} />
        <TabStrip
          tabs={tabItems}
          activeSlug={slug}
          botBySlug={botBySlug}
          isUnread={isUnread}
          isPosted={isPosted}
          homeUnread={waiting}
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
      {slug === SETTINGS_ROUTE ? (
        <SettingsPage settings={data?.settings ?? null} defaults={data?.settingsDefaults ?? null} />
      ) : slug === TICKETS_ROUTE ? (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <HomeNav active="tickets" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-1 text-fg-muted">Open Jira tickets</p>
          <TicketsBoard payload={tickets} />
        </div>
      ) : slug ? (
        <>
        {stack && current && <StackBoard stack={stack} items={items} current={current} isPosted={isPosted} onSelect={go} />}
        {!data ? <ReviewSkeleton /> : !current ? <ReviewMissing /> : (
        <Suspense fallback={<ReviewSkeleton />}>
        <ReviewReader item={current} review={review} reviewError={reviewError} onRetry={retryReview} projectUrl={data?.projectUrl ?? null} allowPosting={data?.allowPosting ?? false} allowPush={data?.allowPush ?? false} live={current && data?.status?.current && String(data.status.current.iid) === String(current.iid) ? data.status.current : null} posted={data?.posted ?? EMPTY_POSTED} reload={reload} />
        </Suspense>
        )}
        </>
      ) : (
        <div className="mx-auto max-w-7xl px-6 py-8">
          {data?.ticketsEnabled && <HomeNav active="reviews" />}
          <h1 className={cn('text-3xl font-semibold tracking-tight', data?.ticketsEnabled && 'mt-4')}>Review queue</h1>
          <p className="mt-1 text-fg-muted">
            {data && (waiting > 0 ? `${waiting} waiting on you.` : 'Nothing is waiting on you.')}
            {data && !data.allowPosting && ' Read-only: nothing is posted to GitLab.'}
          </p>

          {data && groups.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-fg-muted"><Inbox className="size-8" />No recent reviews.</div>
          ) : (
            <ReviewGroups groups={groups} isUnread={isUnread} />
          )}
        </div>
      )}
        </main>
      </div>
    </LazyMotion>
    </MotionConfig>
  );
}
