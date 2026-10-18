import { AlertOctagon, CheckCircle2, HelpCircle } from 'lucide-react';

export const VERDICT_ICON = {
  APPROVE: { Icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', accent: 'border-t-emerald-500' },
  REQUEST_CHANGES: { Icon: AlertOctagon, cls: 'text-red-600 dark:text-red-400', accent: 'border-t-red-500' },
  OTHER: { Icon: HelpCircle, cls: 'text-fg-muted', accent: 'border-t-zinc-400' },
} as const;
