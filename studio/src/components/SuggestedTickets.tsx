import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink, ShieldCheck } from 'lucide-react';
import type { Suggestion, SuggestionsPayload } from '../lib/api';
import { NoteMarkdown } from './NoteMarkdown';
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

function SuggestionCard({ s, open, onToggle }: { s: Suggestion; open: boolean; onToggle: () => void }) {
  const panelId = useId();
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
        {s.status === 'accepted' && <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">kept</span>}
        {s.status === 'posted' && <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs text-emerald-700 dark:text-emerald-300">{s.key}</span>}
      </button>
      {open && (
        <div id={panelId} className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
          {s.check && !s.check.ok && (
            <div role="note" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="font-medium">Re-reading the code found statements to fix:</p>
              <ul className="mt-1 list-disc pl-5">{s.check.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {s.files.length > 0 && <p className="mb-3 font-mono text-xs text-fg-muted [overflow-wrap:anywhere]">{s.files.join(' · ')}</p>}
          <h3 className="mb-2 text-sm font-semibold">{s.title}</h3>
          <TicketPreview body={s.body} />
          {s.status === 'posted' && s.url && (
            <a href={s.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">Open {s.key} in Jira<ExternalLink className="size-3.5" aria-hidden /></a>
          )}
        </div>
      )}
    </li>
  );
}

// The factory's suggested tickets, shown as they are; keeping, rewriting or dismissing one happens in the factory.
export function SuggestedTickets({ payload }: { payload: SuggestionsPayload }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!payload.enabled) return null;
  const last = payload.lastRun;
  return (
    <section className="mt-8" aria-labelledby="suggested-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="suggested-title" className="text-xs font-medium uppercase tracking-wide text-fg-muted">Suggested tickets · {payload.items.length}</h2>
        {payload.studio && (
          <a href={payload.studio} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">Judge them in the factory<ExternalLink className="size-3" aria-hidden /></a>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        {payload.running ? 'The factory is reading the code; the list updates when it is done.'
          : last ? `Last run ${new Date(last.at).toLocaleString()}${last.area ? ` on ${last.area}` : ''}: ${last.error ? `failed (${last.error})` : `${last.found ?? 0} found`}.` : 'No run yet.'}
      </p>
      {payload.items.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {payload.items.map((s) => <SuggestionCard key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />)}
        </ul>
      )}
    </section>
  );
}
