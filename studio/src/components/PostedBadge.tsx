import { Check, ExternalLink } from 'lucide-react';
import type { PostedInfo } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { badgeClass } from './ui/badgeStyles';

// Where a comment stands on GitLab: in the pending review, or published (with a link to it).
export function PostedBadge({ info, className }: { info: PostedInfo | undefined; className?: string }) {
  if (!info) return null;
  if (info.state === 'draft') {
    return (
      <Badge tone="warning" ring className={className}>
        <Check className="size-3" />In pending review
      </Badge>
    );
  }
  return (
    <a href={info.url} target="_blank" rel="noreferrer" className={cn(badgeClass({ tone: 'success', ring: true }), className)}>
      <Check className="size-3" />Posted {timeAgo(info.at)}<ExternalLink className="size-3" />
    </a>
  );
}
