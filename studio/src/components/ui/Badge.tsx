import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { badgeClass, type BadgeTone } from './badgeStyles';

export function Badge({ tone, ring, className, ...props }: ComponentProps<'span'> & { tone?: BadgeTone; ring?: boolean }) {
  return <span className={cn(badgeClass({ tone, ring }), className)} {...props} />;
}
