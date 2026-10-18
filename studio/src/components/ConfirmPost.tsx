import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { useScrollLock } from '../lib/useScrollLock';
import { useModalFocus } from '../lib/useModalFocus';
import { Button } from './ui/Button';

// Nothing is sent until "Add to review" is clicked here, with the final text.
export function ConfirmPost({ iid, text, target, onCancel, onConfirm, fallbackRef }: { iid: string | number; text: string; target: { path: string; line?: number } | null; onCancel: () => void; onConfirm: () => Promise<void>; fallbackRef: RefObject<HTMLElement | null> }) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  // Focus moves to Cancel (the safe choice), stays inside, and returns to the opener on close.
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]', fallback: fallbackRef });
  // Always sees the latest busy and onCancel, without re-subscribing every time the parent redraws.
  const onKey = useEffectEvent((e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel());
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-post-title" aria-describedby="confirm-post-text" className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-post-title" className="text-base font-semibold">Add this comment to your review of !{iid}?</h2>
        <p className="mt-1 text-sm text-fg-muted">It joins your pending GitLab review: nobody sees it until you submit the review.</p>
        <p className="mt-1 text-sm text-fg-muted">
          {target ? <>Anchored on <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.85em] dark:bg-zinc-800">{target.path}{target.line ? `:${target.line}` : ''}</code> in the diff{target.line ? '' : ' (whole file)'}.</> : 'No file found above it: it will be a general comment.'}
        </p>
        <pre id="confirm-post-text" tabIndex={0} aria-label="Comment text" className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">{text}</pre>
        <div className="mt-4 flex justify-end gap-2">
          <Button data-autofocus disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } catch (e) {
                toast.error('Could not add the comment', { description: (e as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-4" />}Add to review
          </Button>
        </div>
      </div>
    </div>
  );
}
