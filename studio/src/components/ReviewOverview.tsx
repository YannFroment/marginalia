import { ArrowRight } from 'lucide-react';
import type { Overview } from '../lib/api';

// The change at a glance, before and after, in plain words: the first thing to read.
export function ReviewOverview({ overview }: { overview: Overview }) {
  return (
    <section aria-label="Before and after" className="mb-4 grid shrink-0 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Before</h2>
        <p className="mt-1 text-sm">{overview.before}</p>
      </div>
      <ArrowRight className="hidden size-5 self-center text-fg-subtle md:block" aria-hidden />
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">After</h2>
        <p className="mt-1 text-sm">{overview.after}</p>
      </div>
    </section>
  );
}
