import { useState } from 'react';
import { toast } from 'sonner';
import { Command, Loader2, RefreshCw, Eye, TriangleAlert, Power, ShieldCheck } from 'lucide-react';
import { setPollInterval, type BotStatus } from '../lib/api';
import { inTime, timeAgo } from '../lib/utils';

function BotState({ status }: { status: BotStatus | null }) {
  if (!status || status.phase === 'stopped') {
    return <span className="flex items-center gap-1.5 text-fg-muted"><Power className="size-4" />Bot stopped</span>;
  }
  if (status.phase === 'reviewing' && status.current) {
    return (
      <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
        <Eye className="size-4" />Reviewing !{status.current.iid}
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }
  if (status.phase === 'polling') {
    return <span className="flex items-center gap-1.5"><RefreshCw className="size-4 animate-spin" />Polling…</span>;
  }
  if (status.phase === 'error') {
    return <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400"><TriangleAlert className="size-4" />Last poll failed</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
      <ShieldCheck className="size-4" />Idle
      {status.nextPollAt && <span className="hidden text-fg-muted sm:inline">· next poll {inTime(status.nextPollAt)}</span>}
    </span>
  );
}

const PRESETS = [1, 2, 5, 10, 15, 30, 60];

// Poll interval, persisted server-side (settings.json); the bot re-arms its timer.
function PollInterval({ minutes }: { minutes: number }) {
  const [pending, setPending] = useState<number | null>(null);
  const value = pending ?? minutes;
  const options = PRESETS.includes(value) ? PRESETS : [...PRESETS, value].sort((a, b) => a - b);
  return (
    <label className="hidden items-center gap-1.5 text-xs text-fg-muted md:flex" title="How often the bot polls GitLab">
      Poll every
      <select
        value={value}
        onChange={async (e) => {
          const next = Number(e.target.value);
          setPending(next);
          try {
            await setPollInterval(next);
            toast.success(`Polling every ${next < 60 ? `${next} min` : `${next / 60} h`}`, { description: 'Applied by the bot right away.' });
          } catch (err) {
            toast.error('Could not change the poll interval', { description: (err as Error).message });
          } finally {
            setPending(null);
          }
        }}
        className={`rounded-md border bg-white px-1.5 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800`}
      >
        {options.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
      </select>
    </label>
  );
}

export function StatusBar({ status, pollMinutes, onOpenPalette, onHome }: { status: BotStatus | null; pollMinutes: number | null; onOpenPalette: () => void; onHome: () => void }) {
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex h-14 items-center gap-4 px-4">
        <button onClick={onHome} className="font-semibold tracking-tight">Marginalia</button>
        <div className="ml-2 text-sm"><BotState status={status} /></div>
        {status?.lastPoll && (
          <span className="hidden text-xs text-fg-muted md:inline">last poll {timeAgo(status.lastPoll.at)}</span>
        )}
        {pollMinutes !== null && <div className="ml-auto"><PollInterval minutes={pollMinutes} /></div>}
        <button
          onClick={onOpenPalette}
          className="ml-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-fg-muted hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          Search…
          <kbd className="flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800"><Command className="size-3" />K</kbd>
        </button>
      </div>
    </div>
  );
}
