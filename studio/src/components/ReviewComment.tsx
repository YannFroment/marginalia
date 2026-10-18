import { Children, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Pencil, Send, Undo2 } from 'lucide-react';
import { postComment } from '../lib/api';
import { textOf } from '../lib/markdown';
import { editKey, readEdit, writeEdit } from '../lib/commentEdits';
import { commentTargetAt, squash, writtenComment } from '../lib/reviewComments';
import { PostContext, SourceContext, type PostContextValue } from '../lib/reviewContexts';
import { Button } from './ui/Button';
import { ConfirmPost } from './ConfirmPost';
import { PostedBadge } from './PostedBadge';

function CopyButton({ getText, label, disabled }: { getText: () => string; label: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          toast.success('Comment copied to clipboard');
        } catch {
          toast.error('Could not copy: clipboard access was denied');
        }
      }}
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : label}
    </Button>
  );
}

// The id of the finding a comment belongs to, which survives a re-run that rewords it, and where
// it stands on GitLab. Comments posted before findings existed were keyed by a hash of their text.
function resolveComment(post: PostContextValue, original: string, legacyId: string) {
  const commentId = post.findings.find((f) => f.comment && squash(f.comment) === squash(original))?.id ?? legacyId;
  const postedInfo = post.slug ? post.posted[`${post.slug}:${commentId}`] ?? post.posted[`${post.slug}:${legacyId}`] : undefined;
  return { commentId, postedInfo };
}

// The "**Comment to post:**" blockquotes are meant to be pasted into GitLab:
// copy as is, or edit first in a textarea (the edit is kept locally).
export function Quote({ children, offset }: { children?: ReactNode; offset?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [original, setOriginal] = useState(() => textOf(children).trim());
  const key = editKey(original);
  const [edited, setEdited] = useState<string | null>(() => readEdit(key));
  const [editing, setEditing] = useState(false);
  const post = useContext(PostContext);
  const source = useContext(SourceContext);
  // The comment as the skill wrote it (fences and backticks intact, which GitLab renders), not
  // the rendered text: the code cards add their own labels to what the page shows.
  const written = useMemo(() => writtenComment(source, offset), [source, offset]);
  const current = edited ?? written ?? ref.current?.innerText.trim() ?? original;
  // The id of the finding this comment belongs to, which survives a re-run that rewords it.
  // Comments posted before findings existed were keyed by a hash of their text.
  const { commentId, postedInfo } = resolveComment(post, original, key.split(':').pop() ?? '');
  const [confirming, setConfirming] = useState(false);
  // The file:line the review mentions just above this comment, since the last heading.
  const target = useMemo(() => commentTargetAt(source, offset), [source, offset]);
  // Focus lands here if the button that opened the dialog is gone (a posted comment replaces it).
  const rootRef = useRef<HTMLDivElement>(null);
  // A re-run is about to replace this comment: close the editor and any open confirmation.
  // An edit already typed stays saved locally under its key.
  useEffect(() => {
    if (!post.locked) return;
    setEditing(false);
    setConfirming(false);
  }, [post.locked]);

  const startEdit = () => {
    const text = written ?? ref.current?.innerText.trim() ?? original;
    setOriginal((o) => o || text);
    setEdited((e) => e ?? text);
    setEditing(true);
  };
  const update = (v: string) => {
    setEdited(v);
    writeEdit(key, v);
  };
  const reset = () => {
    setEdited(null);
    writeEdit(key, null);
    setEditing(false);
    toast('Reverted to the generated comment');
  };

  return (
    <div ref={rootRef} tabIndex={-1} className="not-prose my-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 focus:outline-none">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
        <span>
          Comment to post{edited !== null && !editing ? ' · edited' : ''}
          <PostedBadge info={postedInfo} className="ml-2 normal-case tracking-normal" />
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5 normal-case tracking-normal [&>button]:whitespace-nowrap">
          {edited !== null && (
            <Button size="sm" variant="ghost" disabled={post.locked} onClick={reset}>
              <Undo2 className="size-3.5" />Reset
            </Button>
          )}
          <Button size="sm" disabled={post.locked} onClick={() => (editing ? setEditing(false) : startEdit())}>
            {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
            {editing ? 'Done' : 'Edit'}
          </Button>
          <CopyButton label="Copy" disabled={post.locked} getText={() => current} />
          {post.allowPosting && post.slug && post.iid && !postedInfo && (
            <Button size="sm" variant="primary" disabled={post.locked} title={post.locked ? 'A review re-run is in progress: this comment is about to be replaced' : undefined} onClick={() => setConfirming(true)}>
              <Send className="size-3.5" />Add to review
            </Button>
          )}
        </span>
      </div>
      {editing ? (
        <textarea
          autoFocus
          aria-label="Edit the comment"
          value={edited ?? ''}
          onChange={(e) => update(e.target.value)}
          rows={Math.min(14, Math.max(4, (edited ?? '').split('\n').length + 2))}
          className="w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm leading-relaxed outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900"
        />
      ) : edited !== null ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{edited}</div>
      ) : (
        <div ref={ref} className="whitespace-pre-wrap text-sm leading-relaxed">{Children.toArray(children)}</div>
      )}
      {confirming && post.slug && post.iid && (
        <ConfirmPost
          iid={post.iid}
          text={current}
          target={target}
          fallbackRef={rootRef}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const posted = await postComment(post.slug!, commentId, current, target ?? undefined);
            setConfirming(false);
            post.reload();
            if (target && posted.inline === false) toast.warning('Could not anchor it to the diff, added as a general comment');
            toast.success(`Added to your pending review of !${post.iid}`, { description: 'Submit the review to publish it.' });
          }}
        />
      )}
    </div>
  );
}
