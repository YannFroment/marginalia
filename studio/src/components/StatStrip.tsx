import { AlertOctagon, CircleDot } from 'lucide-react';
import { cn } from '../lib/utils';

export type Filter = 'all' | 'changes' | 'unread';

const TILES = {
  changes: { label: 'Need changes', Icon: AlertOctagon, on: 'border-red-500/50 bg-red-500/10', num: 'text-red-600 dark:text-red-400' },
  unread: { label: 'Unread', Icon: CircleDot, on: 'border-blue-500/50 bg-blue-500/10', num: 'text-blue-600 dark:text-blue-400' },
} as const;

// Counters that double as filters: click one to filter the grid, click it
// again to clear. They replace the old filter pills, so nothing is listed
// twice on Home.
export function StatStrip({ counts, active, onChange, keys }: {
  counts: Record<keyof typeof TILES, number>;
  active: Filter;
  onChange: (f: Filter) => void;
  keys: (keyof typeof TILES)[];
}) {
  return (
    <div role="group" aria-label="Filter reviews" className={cn('mt-4 grid max-w-xl gap-3', keys.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {keys.map((k) => {
        const { label, Icon, on, num } = TILES[k];
        const selected = active === k;
        const empty = counts[k] === 0;
        return (
          <button
            key={k}
            aria-pressed={selected}
            disabled={empty && !selected}
            onClick={() => onChange(selected ? 'all' : k)}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
              selected ? on : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
              empty && !selected && 'opacity-50',
            )}
          >
            <Icon className={cn('size-5 shrink-0', num)} aria-hidden />
            <span className="min-w-0">
              <span className={cn('block text-2xl font-semibold leading-none tabular-nums', empty ? 'text-zinc-400' : num)}>{counts[k]}</span>
              <span className="mt-1 block truncate text-xs text-zinc-500">{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
