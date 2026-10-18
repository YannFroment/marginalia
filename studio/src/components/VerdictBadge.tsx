import { CheckCircle2, AlertOctagon, HelpCircle } from 'lucide-react';
import type { Verdict } from '../lib/api';
import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';
import { TONE_TEXT } from './ui/badgeStyles';

const STYLES = {
  APPROVE: { label: 'Approve', tone: 'success', Icon: CheckCircle2 },
  REQUEST_CHANGES: { label: 'Request changes', tone: 'danger', Icon: AlertOctagon },
  OTHER: { label: 'Other', tone: 'neutral', Icon: HelpCircle },
} as const;

export function VerdictBadge({ verdict, compact = false }: { verdict: Verdict; compact?: boolean }) {
  if (!verdict) return null;
  const { label, tone, Icon } = STYLES[verdict];
  // Compact is a bare icon: the colour carries the verdict, no pill behind it.
  if (compact) {
    return (
      <span title={label} className={cn('inline-flex items-center py-0.5', TONE_TEXT[tone])}>
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Badge tone={tone} ring title={label} className="font-medium">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Badge>
  );
}
