import { useEffect, useRef, useState } from 'react';
import * as m from 'motion/react-m';
import { ChevronLeft, ChevronRight, Route } from 'lucide-react';
import type { Finding, PostedInfo, TourStop } from '../lib/api';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { FindingsPanel } from './FindingsPanel';
import { NoteMarkdown } from './NoteMarkdown';
import { cn } from '../lib/utils';
import { useMrDiff, type DiffScope } from '../lib/useMrDiff';
import { useThreads } from '../lib/useThreads';
import type { Focus } from '../lib/tourFocus';
import { DiffPane } from './DiffPane';
import { StopChat } from './StopChat';

interface Post {
  slug: string;
  iid: string | number;
  allowPosting: boolean;
  locked: boolean;
  posted: Record<string, PostedInfo>;
  reload: () => void;
}

// A guided read of the MR, one stop at a time, in the order the skill chose:
// what the group of changes does, what to check, and the findings on it.
// `diff` says where the code comes from: the MR's slug, the earlier review being read if any, and
// whether to open on what changed since the review (a returned MR).
export interface DiffSource {
  slug: string;
  version: string | null;
  key: string | undefined;
  startSince: boolean;
}

export function ReviewTour({ stops, findings, post, diff: source }: { stops: TourStop[]; findings: Finding[]; post: Post | null; diff: DiffSource | null }) {
  const [at, setIndex] = useState(0);
  // A new review can have fewer stops than the one that was open: never point past the last.
  const index = Math.min(at, stops.length - 1);
  const pane = useRef<HTMLElement>(null);
  const diffPane = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const nonce = useRef(0);
  const select = (id: string, source: Focus['source']) => setFocus({ id, source, nonce: ++nonce.current });
  const previous = useRef(0);
  // Which way the swap goes decides which side the new stop slides in from.
  const direction = index >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = index;
    pane.current?.scrollTo?.({ top: 0 });
    // A new stop starts at the top of its own diff, with nothing pointed at.
    diffPane.current?.scrollTo?.({ top: 0 });
    setFocus(null);
  }, [index]);
  const stopId = stops[index].id;
  const [mode, setMode] = useState<DiffScope['mode']>(source?.startSince ? 'since' : 'full');
  const scope: DiffScope = { version: source?.version ?? null, mode };
  // What the MR's conversation says sits on today's code: it is shown with the current diff only.
  const threads = useThreads(source && !source.version ? source.slug : null, source?.key);
  const { state: diff, retry: retryDiff } = useMrDiff(source?.slug ?? null, stopId, source?.key, scope);
  // ← and → move between stops, anywhere but in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '') || document.querySelector('[role=dialog]')) return;
      if (e.key === 'ArrowRight' && index < stops.length - 1) setIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, stops.length]);
  const stop = stops[index];
  const fileCount = diff.status === 'ready' ? diff.files.length : null;
  const meta = [fileCount === null ? null : `${fileCount} file${fileCount === 1 ? '' : 's'}`, findings.filter((f) => stop.findingIds.includes(f.id)).length === 0 ? 'no findings, skim' : null].filter(Boolean).join(' · ') || ' ';
  const here = findings.filter((f) => stop.findingIds.includes(f.id));
  const last = index === stops.length - 1;
  return (
    <div className="mb-6 grid gap-4 lg:mb-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
    <section ref={pane} aria-label="Review tour" className={cn('rounded-lg border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 lg:h-full lg:overflow-y-auto', post ? 'pb-0' : 'pb-4')}>
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 text-xs text-fg-muted dark:bg-zinc-900">
        <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-wide"><Route className="size-3.5" aria-hidden />Stop {index + 1} of {stops.length}</span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous stop" title="Previous stop (←)"><ChevronLeft className="size-3.5" /></Button>
          <Button size="sm" variant="primary" title="Next stop (→)" disabled={last} onClick={() => setIndex(index + 1)}>Next stop<ChevronRight className="size-3.5" /></Button>
        </div>
      </div>
      <ol className="mt-2 flex gap-1" aria-label="Stops">
        {stops.map((s, i) => (
          <li key={s.id} className="flex-1">
            <button aria-label={`Stop ${i + 1}: ${s.title}`} aria-current={i === index} onClick={() => setIndex(i)} className={cn('h-1.5 w-full rounded-full transition-colors duration-300 motion-reduce:transition-none', i === index ? 'bg-blue-500' : i < index ? 'bg-blue-500/40' : 'bg-zinc-300 dark:bg-zinc-700')} />
          </li>
        ))}
      </ol>
      <m.div key={stop.id} initial={{ opacity: 0, x: direction * 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">{stop.title}{stop.supporting && <Badge className="ml-2 align-middle">Supporting</Badge>}</h2>
        {stop.summary && <NoteMarkdown className="mt-1 text-fg-muted">{stop.summary}</NoteMarkdown>}
        <p className="mt-2 text-xs text-fg-subtle">{meta}</p>
        {here.length > 0 && (
          <div className="mt-4">
            {post ? <FindingsPanel findings={here} compact focus={focus} onFocus={(id) => select(id, 'list')} {...post} /> : (
              <ul className="space-y-1 text-sm">
                {here.map((f) => <li key={f.id}><Badge tone={f.severity === 'critical' ? 'danger' : f.severity === 'important' ? 'warning' : 'neutral'}>{f.severity}</Badge> {f.title}</li>)}
              </ul>
            )}
          </div>
        )}
      </m.div>
      {post && <StopChat key={post.slug} slug={post.slug} stopId={stops[index].id} />}
    </section>
    <div ref={diffPane} className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
      <DiffPane state={diff} findings={findings} threads={threads} focus={focus} scope={scope} onScope={setMode} onSelectFinding={(id) => select(id, 'diff')} onRetry={retryDiff} />
    </div>
    </div>
  );
}
