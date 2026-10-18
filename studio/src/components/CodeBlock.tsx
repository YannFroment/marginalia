import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

// A fenced code block as a card: a header bar with the language (and, for a diff,
// how many lines it adds and removes) and a copy button, then the code.
export function CodeBlock({ lang, text, children }: { lang: string | null; text: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const diff = lang === 'diff' || lang === 'patch';
  const lines = diff ? text.split('\n') : [];
  const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy: clipboard access was denied');
    }
  };
  return (
    <figure className="not-prose my-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <figcaption className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs text-fg-muted dark:border-zinc-800 dark:bg-zinc-900/60">
        <span className="flex items-center gap-2">
          {lang ?? 'text'}
          {diff && (
            <span className="flex gap-1.5">
              <span className="text-emerald-700 dark:text-emerald-400">+{added}</span>
              <span className="text-red-700 dark:text-red-400">−{removed}</span>
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="touch-target inline-flex items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </figcaption>
      {diff ? <DiffLines lines={lines} /> : <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">{children}</pre>}
    </figure>
  );
}

// Each line tinted by what it does to the file: added, removed, hunk header or context.
function DiffLines({ lines }: { lines: string[] }) {
  return (
    <div className="overflow-x-auto py-2 font-mono text-[13px] leading-relaxed">
      <div className="min-w-max">
        {lines.map((line, i) => {
          const header = line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ');
          const kind = header ? 'meta' : line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
          return (
            <div
              key={i}
              className={cn(
                'flex whitespace-pre px-3',
                kind === 'add' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                kind === 'del' && 'bg-red-500/10 text-red-800 dark:text-red-300',
                kind === 'hunk' && 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
                kind === 'meta' && 'text-fg-subtle',
                kind === 'ctx' && 'text-fg-muted',
              )}
            >
              <span aria-hidden className="w-4 shrink-0 select-none opacity-70">{kind === 'add' ? '+' : kind === 'del' ? '−' : ''}</span>
              <span>{kind === 'add' || kind === 'del' ? line.slice(1) : line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
