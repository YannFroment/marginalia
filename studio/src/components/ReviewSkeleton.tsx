import { ArrowRight } from 'lucide-react';
import { DiffSkeleton } from './DiffSkeleton';

const bar = 'shimmer rounded bg-zinc-200 dark:bg-zinc-800';

// What a review looks like before its data is there: the same blocks in the same places, so nothing
// jumps when it arrives. Used while the list loads, while the review itself loads, and as the reader's
// own chunk loads.
export function TourSkeleton() {
  return (
    <div role="status" aria-label="Loading the review" className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <span className="sr-only">Loading the review…</span>
      <div className="mb-4 grid shrink-0 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><div className={`${bar} h-3 w-12`} /><div className={`${bar} mt-3 h-3 w-4/5`} /><div className={`${bar} mt-2 h-3 w-3/5`} /></div>
        <ArrowRight className="hidden size-5 self-center text-fg-subtle md:block" aria-hidden />
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"><div className={`${bar} h-3 w-12`} /><div className={`${bar} mt-3 h-3 w-4/5`} /><div className={`${bar} mt-2 h-3 w-2/5`} /></div>
      </div>
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between"><div className={`${bar} h-3 w-24`} /><div className={`${bar} h-7 w-28`} /></div>
          <div className="mt-4 flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={`${bar} h-1.5 flex-1 rounded-full`} />)}</div>
          <div className={`${bar} mt-5 h-5 w-3/4`} />
          <div className="mt-4 space-y-2"><div className={`${bar} h-3 w-full`} /><div className={`${bar} h-3 w-11/12`} /><div className={`${bar} h-3 w-2/3`} /></div>
          <div className="mt-6 space-y-2"><div className={`${bar} h-10 w-full`} /><div className={`${bar} h-10 w-full`} /></div>
        </div>
        <div className="min-w-0"><DiffSkeleton /></div>
      </div>
    </div>
  );
}

// The whole review page: header and tour, as `ReviewReader` lays them out.
export function ReviewSkeleton() {
  return (
    <div className="px-6 py-6">
      <div className="lg:flex lg:h-[calc(100vh-var(--chrome-h)-3rem)] lg:flex-col">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className={`${bar} h-7 w-96 max-w-[50vw]`} /><div className={`${bar} h-6 w-28 rounded-full`} /><div className={`${bar} h-6 w-20 rounded-full`} /></div>
          <div className="flex gap-2"><div className={`${bar} h-9 w-32`} /><div className={`${bar} h-9 w-9`} /></div>
        </div>
        <TourSkeleton />
      </div>
    </div>
  );
}

// The address names a review that does not exist (any more): say so, and the way out.
export function ReviewMissing() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">This review is not here</h1>
      <p className="mt-2 text-fg-muted">It may have been removed, or the link is wrong.</p>
      <a href="#/" className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">Back to the review queue</a>
    </div>
  );
}
