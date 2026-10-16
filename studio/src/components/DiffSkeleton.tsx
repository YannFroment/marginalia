import { cn } from '../lib/utils';

// Widths of the code lines, in percent: uneven on purpose, so it reads as code and not as a table.
const LINES = [58, 82, 40, 0, 66, 91, 74, 35, 0, 52, 86, 61, 44, 78];

const bar = 'shimmer rounded bg-zinc-200 dark:bg-zinc-800';

// What the diff pane shows while a stop's files load: the shape of a diff, with a light
// sweep across it. Same footprint as the real thing, so nothing jumps when it arrives.
export function DiffSkeleton() {
  return (
    <div role="status" aria-label="Loading the diff" className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <span className="sr-only">Loading the diff…</span>
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className={cn(bar, 'size-3.5')} />
        <div className={cn(bar, 'h-3 w-2/5')} />
        <div className={cn(bar, 'ml-auto h-3 w-14')} />
      </div>
      <div className="space-y-2.5 px-3 py-3.5">
        {LINES.map((width, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={cn(bar, 'h-3 w-5 shrink-0')} />
            <div className={cn(bar, 'h-3 w-5 shrink-0')} />
            {width > 0 && <div className={cn(bar, 'h-3')} style={{ width: `${width}%`, animationDelay: `${i * 60}ms` }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
