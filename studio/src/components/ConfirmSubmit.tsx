import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { m } from 'motion/react';
import { Check, Loader2, MessageSquare, Send, X, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchDrafts, type DraftNote, type ReviewAction } from '../lib/api';
import { useScrollLock } from '../lib/useScrollLock';
import { useModalFocus } from '../lib/useModalFocus';
import { Button } from './ui/Button';
import { DraftRow } from './DraftRow';

const ACTIONS: { value: ReviewAction; label: string; submit: string; hint: string; Icon: LucideIcon; on: string }[] = [
  { value: 'comment', label: 'Comment', submit: 'Submit comments', hint: 'Publish your comments without a verdict.', Icon: MessageSquare, on: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { value: 'approve', label: 'Approve', submit: 'Approve', hint: 'Publish, then approve the MR as you. Refused if the MR changed since this review.', Icon: Check, on: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { value: 'request_changes', label: 'Request changes', submit: 'Request changes', hint: 'Publish and mark the MR as needing changes.', Icon: X, on: 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300' },
];

// Publishes the pending review: every draft comment of this MR, plus an optional summary,
// with the verdict the user picks (a triage of your own MR can only comment).
export function ConfirmSubmit({ slug, iid, count, canVerdict, reload, onCancel, onConfirm }: { slug: string; reload: () => void; iid: string | number; count: number; canVerdict: boolean; onCancel: () => void; onConfirm: (summary: string, action: ReviewAction) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  const [action, setAction] = useState<ReviewAction>('comment');
  const chosen = ACTIONS.find((a) => a.value === action)!;
  // Read from GitLab itself, so drafts started in its own UI are listed too.
  const [drafts, setDrafts] = useState<DraftNote[] | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchDrafts(slug).then((d) => live && setDrafts(d), (e) => live && setDraftsError((e as Error).message));
    return () => {
      live = false;
    };
  }, [slug]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]' });
  const onKey = useEffectEvent((e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel());
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const loading = !drafts && !draftsError;
  const locked = busy || loading;
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
      <m.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-submit-title"
        aria-busy={locked}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/30 dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 pb-3 pt-5">
          <h2 id="confirm-submit-title" className="text-lg font-semibold tracking-tight">Submit your review <span className="font-normal text-fg-subtle">!{iid}</span></h2>
          <p className="mt-1 text-sm text-fg-muted">{count} pending comment{count === 1 ? '' : 's'}, published as one review under your account. The MR author will see it.</p>
        </header>
        <fieldset disabled={locked} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2 disabled:[&_textarea]:opacity-60">
          <legend className="sr-only">Review to submit</legend>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg" aria-label="Pending comments">
            {draftsError && <p className="text-sm text-red-600 dark:text-red-400">Could not load the drafts: {draftsError}</p>}
            {loading && (
              <div role="status" className="space-y-2" aria-label="Loading the pending comments">
                {[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-800" />)}
              </div>
            )}
            {drafts?.length === 0 && <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-fg-muted dark:border-zinc-700">No pending comment on GitLab.</p>}
            {drafts?.map((d) => (
              <DraftRow key={d.id} slug={slug} draft={d} disabled={busy} onChanged={(next) => { setDrafts((all) => (all ?? []).flatMap((x) => (x.id !== d.id ? [x] : next ? [next] : []))); reload(); }} />
            ))}
          </div>
          {canVerdict && (
            <div role="radiogroup" aria-label="Your review">
              <div className="grid grid-cols-3 gap-2">
                {ACTIONS.map(({ value, label, Icon, on }) => (
                  <label key={value} className={cn('flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60', action === value ? on : 'border-zinc-200 text-fg-muted hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800')}>
                    <input type="radio" name="review-action" value={value} checked={action === value} onChange={() => setAction(value)} className="sr-only" />
                    <Icon className="size-4" aria-hidden />{label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-fg-muted" aria-live="polite">{chosen.hint}</p>
            </div>
          )}
          <div>
            <label htmlFor="review-summary" className="block text-sm font-medium">Summary <span className="font-normal text-fg-muted">(optional)</span></label>
            <textarea id="review-summary" data-autofocus value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="One or two lines for the author" className="mt-1.5 w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm outline-none placeholder:text-fg-subtle focus-visible:border-blue-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-950" />
          </div>
        </fieldset>
        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <Button disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={locked}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(summary, canVerdict ? action : 'comment');
              } catch (e) {
                toast.error('Could not submit the review', { description: (e as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-4" />}{busy ? 'Submitting…' : canVerdict ? chosen.submit : 'Submit review'}
          </Button>
        </footer>
      </m.div>
    </div>
  );
}
