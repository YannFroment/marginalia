import { useEffect } from 'react';
import { Command } from 'cmdk';
import { FileText } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { useScrollLock } from '../lib/useScrollLock';
import { VerdictBadge } from './VerdictBadge';

export function CommandPalette({ open, setOpen, items, onSelect }: { open: boolean; setOpen: (o: boolean) => void; items: ReviewItem[]; onSelect: (slug: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useScrollLock(open);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <Command
        label="Search reviews"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <Command.Input autoFocus placeholder="MR, title, branch, author…" className="w-full border-b border-zinc-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-zinc-800" />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-500">No results</Command.Empty>
          {items.map((it) => (
            <Command.Item
              key={it.slug}
              value={`${it.iid ?? ''} ${it.title} ${it.branch ?? ''} ${it.author ?? ''} ${it.slug}`}
              onSelect={() => {
                onSelect(it.slug);
                setOpen(false);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
            >
              <FileText className="size-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate">{it.iid ? <span className="mr-2 font-mono text-xs text-zinc-500">!{it.iid}</span> : null}{it.title}</span>
              <VerdictBadge verdict={it.verdict} />
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
