import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DiffFile, Finding, Thread } from '../lib/api';
import { threadsForFile } from '../lib/threads';
import { cn } from '../lib/utils';
import { scrollInPane, type Focus } from '../lib/tourFocus';
import { Badge } from './ui/Badge';
import { ThreadCard, ThreadRow } from './ThreadRow';

const ROW = { add: 'bg-emerald-500/10', del: 'bg-red-500/10', ctx: '', hunk: 'bg-blue-500/10 text-fg-muted' } as const;
const SIGN = { add: '+', del: '-', ctx: ' ', hunk: '' } as const;
const TONE = { critical: 'danger', important: 'warning', suggestion: 'info', info: 'neutral' } as const;
const PREVIEW_LINES = 300;

// One changed file of the MR, with the review's findings under the lines they are about.
export function DiffFileView({ file, findings, threads, defaultOpen, focus, onSelectFinding }: { file: DiffFile; findings: Finding[]; threads: Thread[]; defaultOpen: boolean; focus: Focus | null; onSelectFinding: (id: string) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const handled = useRef(0);
  const mine = findings.filter((f) => f.path === file.path);
  const shown = all ? file.lines : file.lines.slice(0, PREVIEW_LINES);
  const { byLine, loose } = useMemo(() => threadsForFile(file, threads), [file, threads]);
  const threadCount = threads.filter((t) => t.path === file.path || t.path === file.oldPath).length;

  // A click on a finding in the list brings its place here: the file opens, the line is shown, it scrolls there and
  // lights up for a moment. A finding with no line in this diff lands on its file.
  const target = focus?.source === 'list' ? mine.find((f) => f.id === focus.id) : undefined;
  const targetIndex = target?.line ? file.lines.findIndex((l) => l.new === target.line) : -1;
  useEffect(() => {
    if (!focus || !target || handled.current === focus.nonce) return undefined;
    if (!open) {
      setOpen(true);
      return undefined;
    }
    if (!all && targetIndex >= PREVIEW_LINES) {
      setAll(true);
      return undefined;
    }
    handled.current = focus.nonce;
    const el = root.current?.querySelector<HTMLElement>(`[data-finding="${target.id}"]`) ?? root.current;
    if (el) scrollInPane(el);
    setFlash(target.id);
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [focus, target, open, all, targetIndex]);

  return (
    <section ref={root} aria-label={file.path} className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 bg-zinc-50 px-3 py-2 text-left text-xs dark:bg-zinc-900">
        {open ? <ChevronDown className="size-3.5 shrink-0" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
        <code className="min-w-0 flex-1 break-all">{file.path}</code>
        {mine.length > 0 && <Badge tone="warning">{mine.length}</Badge>}
        {threadCount > 0 && <Badge tone="violet" title="Threads on GitLab">{threadCount}</Badge>}
        <span className="shrink-0 font-mono text-emerald-700 dark:text-emerald-300">+{file.additions}</span>
        <span className="shrink-0 font-mono text-red-700 dark:text-red-300">-{file.deletions}</span>
      </button>
      {open && (file.omitted ? (
        <p className="px-3 py-2 text-xs text-fg-muted">GitLab left this diff out (too large or collapsed). Open it in GitLab.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs leading-5">
            <tbody>
              {shown.map((l, i) => (
                <Fragment key={i}>
                  <tr className={cn(ROW[l.t], l.new != null && mine.some((f) => f.id === flash && f.line === l.new) && 'bg-blue-500/25')}>
                    <td className="w-10 select-none px-2 text-right text-fg-subtle">{l.old ?? ''}</td>
                    <td className="w-10 select-none px-2 text-right text-fg-subtle">{l.new ?? ''}</td>
                    <td className="whitespace-pre pr-3"><span aria-hidden className="select-none pr-1">{SIGN[l.t]}</span>{l.t === 'hunk' ? l.text : l.text || ' '}</td>
                  </tr>
                  {l.new != null && mine.filter((f) => f.line === l.new).map((f) => (
                    <tr
                      key={f.id}
                      data-finding={f.id}
                      tabIndex={0}
                      title="Open in the list"
                      onClick={() => onSelectFinding(f.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSelectFinding(f.id); }}
                      className="cursor-pointer"
                    >
                      <td colSpan={3} className={cn('border-y border-amber-500/30 bg-amber-500/5 px-3 py-1.5 font-sans text-sm transition-colors hover:bg-amber-500/10', flash === f.id && 'bg-blue-500/20 ring-2 ring-inset ring-blue-500')}>
                        <Badge tone={TONE[f.severity]} className="mr-2">{f.severity}</Badge>
                        <span className={cn('font-medium')}>{f.title}</span>
                      </td>
                    </tr>
                  ))}
                  {(byLine.get(i) ?? []).map((t) => <ThreadRow key={t.id} thread={t} />)}
                </Fragment>
              ))}
            </tbody>
          </table>
          {loose.length > 0 && (
            <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs text-fg-muted">Threads on this file whose line is not in this diff</p>
              {loose.map((t) => <ThreadCard key={t.id} thread={t} showPlace />)}
            </div>
          )}
          {!all && file.lines.length > PREVIEW_LINES && (
            <button className="w-full border-t border-zinc-200 px-3 py-1.5 text-xs text-blue-600 dark:border-zinc-800 dark:text-blue-400" onClick={() => setAll(true)}>Show all {file.lines.length} lines</button>
          )}
        </div>
      ))}
    </section>
  );
}
