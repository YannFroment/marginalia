import { ExternalLink, Loader2, RefreshCw, Send } from 'lucide-react';
import type { Risk, ReviewItem, ReviewVersion } from '../lib/api';
import { cn } from '../lib/utils';
import { RiskBadge } from './RiskBadge';
import { VerdictBadge } from './VerdictBadge';
import { Button } from './ui/Button';

// Title, verdict and the actions on a review.
export function ReaderHeader({ item, risk, showSubmit, draftCount, onSubmit, versions, versionId, onVersion, locked, onRerun }: {
  item: ReviewItem | undefined;
  risk: Risk | null;
  showSubmit: boolean;
  draftCount: number;
  onSubmit: () => void;
  versions: ReviewVersion[];
  versionId: string | null;
  onVersion: (id: string | null) => void;
  locked: boolean;
  onRerun: () => void;
}) {
  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-x-3">
          <h1 title={item?.title} className="min-w-0 truncate text-2xl font-semibold tracking-tight">{item?.title ?? 'Review'}</h1>
          <span className="flex shrink-0 items-center gap-2">
            <VerdictBadge verdict={item?.verdict ?? null} />
            <RiskBadge level={risk?.level ?? null} why={risk?.rationale} />
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showSubmit && (
          <Button variant="primary" onClick={onSubmit}>
            <Send className="size-3.5" />Submit review{draftCount > 0 ? ` (${draftCount})` : ''}
          </Button>
        )}
        {versions.length > 0 && (
          <select
            value={versionId ?? ''}
            onChange={(e) => onVersion(e.target.value || null)}
            aria-label="Review version"
            className="touch-target rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value="">Latest review</option>
            {versions.map((v) => <option key={v.id} value={v.id}>{new Date(v.at).toLocaleString()}</option>)}
          </select>
        )}
        {item?.tracked && item.kind !== 'retro' && (
          <Button disabled={locked} onClick={onRerun} aria-label="Re-run review" title="Run the review again on the current head of the MR" className="px-2.5">
            {locked ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <RefreshCw className="size-4" />}
          </Button>
        )}
        {item?.webUrl && (
          <a href={item.webUrl} target="_blank" rel="noreferrer" aria-label="Open in GitLab" title="Open in GitLab" className="touch-target inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800">
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
