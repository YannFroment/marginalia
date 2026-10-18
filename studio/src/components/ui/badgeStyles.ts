import { cn } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

// Status is double-coded (colour plus an icon or a word), so a badge always carries text.
export const TONE_TEXT: Record<BadgeTone, string> = {
  neutral: 'text-zinc-600 dark:text-zinc-300',
  info: 'text-blue-700 dark:text-blue-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
  violet: 'text-violet-700 dark:text-violet-300',
};
const TONE_FILL: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-500/10',
  info: 'bg-blue-500/10',
  success: 'bg-emerald-500/10',
  warning: 'bg-amber-500/10',
  danger: 'bg-red-500/10',
  violet: 'bg-violet-500/10',
};
const TONE_RING: Record<BadgeTone, string> = {
  neutral: 'ring-zinc-500/30',
  info: 'ring-blue-500/30',
  success: 'ring-emerald-500/30',
  warning: 'ring-amber-500/30',
  danger: 'ring-red-500/30',
  violet: 'ring-violet-500/30',
};

// Also usable on a link: <a className={badgeClass({ tone: 'success', ring: true })}>.
export function badgeClass({ tone = 'neutral', ring = false }: { tone?: BadgeTone; ring?: boolean } = {}) {
  return cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', TONE_FILL[tone], TONE_TEXT[tone], ring && ['ring-1 ring-inset', TONE_RING[tone]]);
}
