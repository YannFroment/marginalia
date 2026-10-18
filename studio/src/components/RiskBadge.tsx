import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react';
import type { RiskLevel } from '../lib/api';
import { Badge } from './ui/Badge';

const STYLES = {
  low: { label: 'Low risk', tone: 'success', Icon: ShieldCheck },
  medium: { label: 'Medium risk', tone: 'warning', Icon: Shield },
  high: { label: 'High risk', tone: 'danger', Icon: ShieldAlert },
} as const;

// How much attention the MR deserves, double-coded (colour, icon and word).
export function RiskBadge({ level, why }: { level: RiskLevel | null; why?: string | null }) {
  if (!level) return null;
  const { label, tone, Icon } = STYLES[level];
  return (
    <Badge tone={tone} ring title={why ? `${label}: ${why}` : label} className="font-medium">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Badge>
  );
}
