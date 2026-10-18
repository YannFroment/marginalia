import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

// DESIGN.md: one filled primary button in view at a time. Controls are compact for mouse and
// trackpad and reach 44px on coarse pointers (touch-target). Icons are sized by the caller:
// size-3.5 next to `sm` text, size-4 next to `md`.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 font-medium text-white hover:bg-blue-500',
  secondary: 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
  ghost: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  danger: 'text-red-600 hover:bg-red-500/10 dark:text-red-400',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1 rounded-md px-2 py-1 text-xs',
  md: 'gap-1.5 rounded-lg px-3 py-1.5 text-sm',
};

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={cn('touch-target inline-flex items-center justify-center whitespace-nowrap disabled:opacity-50', VARIANTS[variant], SIZES[size], className)} {...props} />;
}
