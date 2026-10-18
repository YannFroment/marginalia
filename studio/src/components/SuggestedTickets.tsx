import { useId, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ExternalLink, Lightbulb, Loader2, Pencil, Send, ShieldCheck, X } from 'lucide-react';
import { dismissSuggestion, postSuggestion, runSuggestions, type Suggestion, type SuggestionsPayload } from '../lib/api';
import { NoteMarkdown } from './NoteMarkdown';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

const PANEL_STYLE: Record<string, string> = {
  info: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40',
  note: 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40',
  warning: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
  success: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
  error: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
};

// The body as Jira will show it: `:::warning` blocks become coloured panels.
function TicketPreview({ body }: { body: string }) {
  const parts = body.split(/^:::(\w+)?\s*$/m);
  // split with one capture group alternates text, panel type, text...
  const blocks: { panel: string | null; text: string }[] = [];
  let open: string | null = null;
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i].trim()) blocks.push({ panel: open, text: parts[i] });
    const marker = parts[i + 1];
    if (i + 1 < parts.length) open = open ? null : (marker ?? 'info');
  }
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (b.panel
        ? <div key={i} className={cn('rounded-lg border px-3 py-2', PANEL_STYLE[b.panel] ?? PANEL_STYLE.info)}><NoteMarkdown>{b.text}</NoteMarkdown></div>
        : <NoteMarkdown key={i}>{b.text}</NoteMarkdown>))}
    </div>
  );
}

// One suggestion open at a time: DESIGN.md keeps a single filled primary button in view.
function SuggestionCard({ s, canPost, project, open, onToggle }: { s: Suggestion; canPost: boolean; project: string; open: boolean; onToggle: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [body, setBody] = useState(s.body);
  const [busy, setBusy] = useState<'post' | 'dismiss' | null>(null);
  const panelId = useId();
  const posted = s.status === 'posted';

  const act = async (kind: 'post' | 'dismiss') => {
    setBusy(kind);
    try {
      if (kind === 'post') {
        const { key, url } = await postSuggestion(s.id, title, body);
        toast.success(`${key} created`, { action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noreferrer') } });
      } else {
        await dismissSuggestion(s.id);
      }
    } catch (e) {
      toast.error(kind === 'post' ? 'Could not create the ticket' : 'Could not dismiss', { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="bg-white dark:bg-zinc-900">
      <button aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none', open ? '' : '-rotate-90')} aria-hidden />
        <span className="min-w-0 flex-1 basis-56">
          <span className="font-medium">{s.title}</span>
          <span className="mt-0.5 block text-xs text-fg-muted">{s.why}</span>
        </span>
        {s.principle && <span className="max-w-full rounded bg-violet-500/10 px-1.5 py-0.5 text-xs text-violet-700 dark:text-violet-300">{s.principle}</span>}
        {s.check && (s.check.ok
          ? <span title="Every claim was re-read against the code" className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300"><ShieldCheck className="size-3" aria-hidden />Checked</span>
          : <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="size-3" aria-hidden />{s.check.problems.length} to check</span>)}
        {posted && <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-300">{s.key}</span>}
      </button>
      {open && (
        <div id={panelId} className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
          {s.check && !s.check.ok && (
            <div role="note" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="font-medium">Re-reading the code found statements to fix before posting:</p>
              <ul className="mt-1 list-disc pl-5">{s.check.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {s.files.length > 0 && <p className="mb-3 font-mono text-xs text-fg-muted [overflow-wrap:anywhere]">{s.files.join(' · ')}</p>}
          {editing ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-fg-muted">Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-fg dark:border-zinc-700 dark:bg-zinc-950" />
              </label>
              <label className="block text-xs font-medium text-fg-muted">Description (markdown)
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 font-mono text-xs text-fg dark:border-zinc-700 dark:bg-zinc-950" />
              </label>
            </div>
          ) : (
            <>
              <h3 className="mb-2 text-sm font-semibold">{title}</h3>
              <TicketPreview body={body} />
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {posted ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">Open {s.key} in Jira<ExternalLink className="size-3.5" aria-hidden /></a>
            ) : (
              <>
                <Button variant="primary" disabled={!canPost || busy !== null || !title.trim() || !body.trim()} title={canPost ? undefined : 'Creating tickets is off (SUGGEST_ALLOW_CREATE)'} onClick={() => act('post')}>
                  {busy === 'post' ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" aria-hidden /> : <Send className="size-4" aria-hidden />}Post to {project}
                </Button>
                <Button onClick={() => setEditing(!editing)} disabled={busy !== null}><Pencil className="size-4" aria-hidden />{editing ? 'Preview' : 'Edit'}</Button>
                <Button variant="ghost" onClick={() => act('dismiss')} disabled={busy !== null} className="ml-auto"><X className="size-4" aria-hidden />Dismiss</Button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// Tickets drafted by the model from the code; nothing reaches Jira until Post.
export function SuggestedTickets({ payload }: { payload: SuggestionsPayload }) {
  // The run's last date when you clicked: until a newer run lands, the click counts as running.
  const [clickedAt, setClickedAt] = useState<string | null | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!payload.enabled) return null;
  const last = payload.lastRun;
  const running = payload.running || (clickedAt !== undefined && clickedAt === (last?.at ?? null));
  const start = async () => {
    setClickedAt(last?.at ?? null);
    try {
      await runSuggestions();
    } catch (e) {
      toast.error('Could not start the search', { description: (e as Error).message });
      setClickedAt(undefined);
    }
  };
  return (
    <section className="mt-8" aria-labelledby="suggested-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="suggested-title" className="text-xs font-medium uppercase tracking-wide text-fg-muted">Suggested tickets · {payload.items.length}</h2>
        <Button size="sm" className="ml-auto" disabled={running} onClick={start}>
          {running ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" aria-hidden /> : <Lightbulb className="size-3.5" aria-hidden />}
          {running ? 'Reading the code…' : 'Find suggestions'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-fg-muted" aria-live="polite">
        {running ? 'This takes a few minutes; the list updates when it is done.'
          : last ? `Last run ${new Date(last.at).toLocaleString()}${last.area ? ` on ${last.area}` : ''}: ${last.error ? `failed (${last.error})` : `${last.found ?? 0} found`}.` : 'No run yet.'}
      </p>
      {payload.items.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {payload.items.map((s) => <SuggestionCard key={s.id} s={s} canPost={payload.canPost} project={payload.project} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />)}
        </ul>
      )}
    </section>
  );
}
