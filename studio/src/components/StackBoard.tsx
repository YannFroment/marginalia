import { AlertOctagon, CheckCircle2, CircleDashed, GitMerge, RefreshCw } from 'lucide-react';
import type { CrossFinding, ReviewItem, Stack, StackLayer } from '../lib/api';
import { cn } from '../lib/utils';

const KIND: Record<CrossFinding['kind'], { label: string; cls: string }> = {
  'settled-later': { label: 'Settled in a later layer', cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
  'belongs-lower': { label: 'Belongs in a lower layer', cls: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  'assumes-upper': { label: 'Assumes a later layer', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
};

interface Row {
  layer: StackLayer;
  item: ReviewItem | undefined;
}

function VerdictIcon({ item }: { item: ReviewItem | undefined }) {
  if (item?.verdict === 'APPROVE') return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Approve" />;
  if (item?.verdict === 'REQUEST_CHANGES') return <AlertOctagon className="size-4 text-red-600 dark:text-red-400" aria-label="Request changes" />;
  return <CircleDashed className="size-4 text-zinc-400" aria-label="Not reviewed" />;
}

// The stack of the open review as one merge verdict: layers bottom to top, who
// blocks whom, and the issues that cross layers.
export function StackBoard({ stack, items, current, isPosted, onSelect }: {
  stack: Stack;
  items: ReviewItem[];
  current: ReviewItem;
  isPosted: (i: ReviewItem) => boolean;
  onSelect: (slug: string) => void;
}) {
  const rows: Row[] = stack.layers.map((layer) => ({ layer, item: items.find((i) => i.slug === layer.slug) }));
  const byIid = new Map(rows.map((r) => [r.layer.iid, r]));
  // Closest layer below that isn't approved and current: it must land first.
  const blockedBy = (r: Row) => {
    for (let p = byIid.get(r.layer.parentIid ?? -1); p; p = byIid.get(p.layer.parentIid ?? -1)) {
      if (p.item?.verdict !== 'APPROVE' || p.item.stale) return p.layer;
    }
    return null;
  };
  const blocking = rows.filter((r) => r.item?.verdict === 'REQUEST_CHANGES').length;
  const waiting = rows.filter((r) => !r.item?.verdict || r.item.stale).length;
  const ready = blocking === 0 && waiting === 0;
  const here = rows.find((r) => r.item?.slug === current.slug);

  // Issues from this review, plus issues other layers raised about this one.
  const cross = [
    ...current.crossLayer.map((c) => ({ ...c, from: here?.layer.iid ?? null })),
    ...rows.filter((r) => r.item && r.item.slug !== current.slug).flatMap((r) => r.item!.crossLayer.filter((c) => c.iid === here?.layer.iid).map((c) => ({ ...c, from: r.layer.iid }))),
  ];
  const slugOf = (iid: number | null) => (iid === null ? null : byIid.get(iid)?.item?.slug ?? null);

  return (
    <section aria-label="Stack" className="space-y-3 border-b border-zinc-200 bg-zinc-50 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <GitMerge className="size-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-semibold">
            {ready ? 'Stack ready to merge, bottom first' : `Stack not ready: ${blocking} blocking, ${waiting} not up to date`}
          </h2>
          <p className="text-sm text-fg-muted">
            {stack.layers.length} layers on <code className="font-mono text-xs">{stack.baseBranch}</code>. Merge bottom to top, retargeting each MR to {stack.baseBranch} once the one below has landed.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-fg-muted">
            <tr><th className="px-3 py-2">Merge</th><th className="px-3 py-2">MR</th><th className="px-3 py-2">Verdict</th><th className="px-3 py-2">Critical / important</th><th className="px-3 py-2">Blocked by</th><th className="px-3 py-2">State</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = r.item?.slug === current.slug;
              const by = blockedBy(r);
              const state = !r.item ? 'waiting' : r.item.stale ? 'stale' : isPosted(r.item) ? 'posted' : 'reviewed';
              return (
                <tr
                  key={r.layer.iid}
                  onClick={() => r.item && onSelect(r.item.slug)}
                  aria-current={active ? 'true' : undefined}
                  className={cn('border-t border-zinc-100 dark:border-zinc-800', active && 'bg-blue-500/10', r.item && !active && 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50')}
                >
                  <td className="px-3 py-2 font-mono text-xs">#{r.layer.position}</td>
                  <td className="px-3 py-2">
                    {r.item ? (
                      <a href={`#/${r.item.slug}`} onClick={(e) => e.stopPropagation()} className="hover:underline"><span className="font-mono text-xs text-fg-muted">!{r.layer.iid}</span> {r.layer.title}</a>
                    ) : (
                      <span><span className="font-mono text-xs text-fg-muted">!{r.layer.iid}</span> {r.layer.title}</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><VerdictIcon item={r.item} /></td>
                  <td className="px-3 py-2 text-fg-muted">{r.item?.verdict ? `${r.item.critical} / ${r.item.important}` : '–'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{by ? `!${by.iid}` : '–'}</td>
                  <td className={cn('px-3 py-2 text-xs', state === 'stale' && 'text-amber-700 dark:text-amber-300', state === 'posted' && 'text-emerald-700 dark:text-emerald-300')}>{state}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {current.stale && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <RefreshCw className="size-4 shrink-0" aria-hidden />
          This review predates new commits on this layer or on the one below. It is re-run on the next poll, lower layers first.
        </div>
      )}

      {cross.length > 0 && (
        <details open className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer font-medium">Across layers · {cross.length}</summary>
          <ul className="mt-2 space-y-2">
            {cross.map((c, i) => {
              const other = c.from === here?.layer.iid ? c.iid : c.from;
              const slug = slugOf(other);
              return (
                <li key={i} className="flex gap-3">
                  <span className={cn('h-fit shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', KIND[c.kind].cls)}>{KIND[c.kind].label}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(c.kind === 'settled-later' && 'text-fg-muted')}>{c.text}</p>
                    {other !== null && (
                      <p className="mt-1 text-xs text-fg-muted">
                        {c.from === here?.layer.iid ? 'Concerns' : 'Raised by'}{' '}
                        {slug ? <a href={`#/${slug}`} onClick={(e) => { e.preventDefault(); onSelect(slug); }} className="text-blue-600 hover:underline dark:text-blue-400">!{other}</a> : `!${other}`}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
