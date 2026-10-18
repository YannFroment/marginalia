import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { GitCommitHorizontal, Loader2, RefreshCw, Upload } from 'lucide-react';
import { fetchFixes, pushFixes, type FixesStatus } from '../lib/api';
import { useScrollLock } from '../lib/useScrollLock';
import { useModalFocus } from '../lib/useModalFocus';
import { Button } from './ui/Button';

const short = (sha: string | null) => sha?.slice(0, 8) ?? '';

// The fixes a triage committed locally, checked against the MR branch on origin, and
// pushed from here when they still sit on top of it.
export function FixesPanel({ slug, iid, allowPush, locked, refreshKey }: { slug: string; iid: string | number; allowPush: boolean; locked: boolean; refreshKey: string }) {
  const [fixes, setFixes] = useState<FixesStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const check = async () => {
    setChecking(true);
    try {
      setFixes(await fetchFixes(slug));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const onRefresh = useEffectEvent(check);
  useEffect(() => {
    setFixes(null);
    onRefresh();
  }, [slug, refreshKey]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">Could not check the fixes: {error}</p>;
  if (!fixes) return <p className="text-sm text-fg-muted">Checking the MR branch…</p>;

  return (
    <div className="space-y-3 text-sm">
      {fixes.state === 'none' && <p className="text-fg-muted">The last triage committed no fix.</p>}
      {fixes.state === 'pushed' && <p className="text-fg-muted">Already on <code>{fixes.branch}</code> (<code>{short(fixes.remoteSha)}</code>): nothing left to push.</p>}
      {fixes.state === 'outdated' && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
          <p className="font-medium">The MR is not up to date with these fixes</p>
          <p className="mt-1">
            {fixes.remoteSha
              ? <><code>{fixes.branch}</code> moved to <code>{short(fixes.remoteSha)}</code> since the triage, so <code>{fixes.ref}</code> no longer sits on top of it.</>
              : <><code>{fixes.branch}</code> is gone from origin.</>}{' '}
            Re-run the triage on the current head, or rebase <code>{fixes.ref}</code> yourself.
          </p>
        </div>
      )}
      {fixes.state === 'ready' && (
        <>
          <p className="text-fg-muted">
            {fixes.commits.length} commit{fixes.commits.length > 1 ? 's' : ''} on top of <code>{fixes.branch}</code> (<code>{short(fixes.remoteSha)}</code>), not pushed yet:
          </p>
          <ul className="space-y-1">
            {fixes.commits.map((c) => (
              <li key={c.sha} className="flex items-baseline gap-2">
                <GitCommitHorizontal className="size-3.5 shrink-0 self-center text-fg-muted" aria-hidden />
                <code className="shrink-0 text-xs text-fg-muted">{short(c.sha)}</code>
                <span className="min-w-0 break-words">{c.subject}</span>
              </li>
            ))}
          </ul>
          {!allowPush && <p className="text-xs text-fg-muted">Set <code>ALLOW_PUSH=true</code> in .env to push them from here, or run <code>git push origin {fixes.ref}:{fixes.branch}</code>.</p>}
        </>
      )}
      <div className="flex gap-2">
        {fixes.state === 'ready' && allowPush && (
          <Button ref={buttonRef} variant="primary" disabled={locked || checking} onClick={() => setConfirming(true)}>
            <Upload className="size-4" />Push to {fixes.branch}
          </Button>
        )}
        <Button disabled={checking} onClick={check} title="Check the MR branch on origin again">
          {checking ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <RefreshCw className="size-4" />}Check again
        </Button>
      </div>
      {confirming && (
        <ConfirmPush
          iid={iid}
          fixes={fixes}
          fallbackRef={buttonRef}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            try {
              setFixes(await pushFixes(slug));
              toast.success(`Fixes pushed to !${iid}`);
            } catch (e) {
              toast.error('Could not push the fixes', { description: (e as Error).message });
              await check();
            } finally {
              setConfirming(false);
            }
          }}
        />
      )}
    </div>
  );
}

function ConfirmPush({ iid, fixes, fallbackRef, onCancel, onConfirm }: { iid: string | number; fixes: FixesStatus; fallbackRef: RefObject<HTMLElement | null>; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]', fallback: fallbackRef });
  const onKey = useEffectEvent((e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel());
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-push-title" className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-push-title" className="text-base font-semibold">Push {fixes.commits.length} commit{fixes.commits.length > 1 ? 's' : ''} to !{iid}?</h2>
        <p className="mt-1 text-sm text-fg-muted">
          <code>{fixes.branch}</code> moves from <code>{short(fixes.remoteSha)}</code> to <code>{short(fixes.fixesSha)}</code>. Fast-forward only: if the branch moved meanwhile, nothing is pushed.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button data-autofocus disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Upload className="size-4" />}Push
          </Button>
        </div>
      </div>
    </div>
  );
}
