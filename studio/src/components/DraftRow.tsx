import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { deleteDraft, updateDraft, type DraftNote } from '../lib/api';
import { Button } from './ui/Button';
import { NoteMarkdown } from './NoteMarkdown';

// One pending draft: read, edit in place, or delete. Goes straight to GitLab's draft notes.
export function DraftRow({ slug, draft, disabled, onChanged }: { slug: string; draft: DraftNote; disabled: boolean; onChanged: (next: DraftNote | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(failure, { description: (e as Error).message });
    }
    setBusy(false);
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <code className="min-w-0 break-all text-xs text-fg-muted">{draft.path ? `${draft.path}${draft.line ? `:${draft.line}` : ''}` : 'General comment'}</code>
        <span className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy || disabled || !text.trim()} onClick={() => run(async () => { await updateDraft(slug, draft.id, text.trim()); onChanged({ ...draft, body: text.trim() }); setEditing(false); }, 'Could not update the draft')}>
                <Check className="size-3.5" />Save
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setText(draft.body); setEditing(false); }}>
                <X className="size-3.5" />Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => setEditing(true)} aria-label="Edit this draft"><Pencil className="size-3.5" />Edit</Button>
              <Button size="sm" variant="danger" disabled={busy || disabled} onClick={() => run(async () => { await deleteDraft(slug, draft.id); onChanged(null); }, 'Could not delete the draft')} aria-label="Delete this draft">
                <Trash2 className="size-3.5" />Delete
              </Button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split('\n').length + 1))} aria-label="Draft text" className="mt-2 w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900" />
      ) : (
        <NoteMarkdown className="mt-1">{draft.body}</NoteMarkdown>
      )}
    </div>
  );
}
