import { Command, Loader2, RefreshCw, Eye, TriangleAlert, Power, ShieldCheck, Settings } from 'lucide-react';
import type { BotStatus } from '../lib/api';
import { inTime, timeAgo } from '../lib/utils';
import { Logo } from './Logo';

function BotState({ status, connection }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok' }) {
  if (connection === 'unreachable') {
    return <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><TriangleAlert className="size-4" />Cannot reach the studio · retrying</span>;
  }
  if (connection === 'connecting') {
    return <span className="flex items-center gap-1.5 text-fg-muted"><Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" />Connecting…</span>;
  }
  if (!status || status.phase === 'stopped') {
    return <span className="flex items-center gap-1.5 text-fg-muted"><Power className="size-4" />Bot stopped</span>;
  }
  if (status.phase === 'reviewing' && status.current) {
    return (
      <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
        <Eye className="size-4" />Reviewing !{status.current.iid}
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" />
      </span>
    );
  }
  if (status.phase === 'polling') {
    return <span className="flex items-center gap-1.5"><RefreshCw className="size-4 animate-spin motion-reduce:animate-pulse" />Polling…</span>;
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

export function StatusBar({ status, connection, settingsActive, onOpenPalette, onHome, onSettings }: { status: BotStatus | null; connection: 'connecting' | 'unreachable' | 'ok'; settingsActive: boolean; onOpenPalette: () => void; onHome: () => void; onSettings: () => void }) {
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex h-14 items-center gap-4 px-4">
        <button onClick={onHome} className="touch-target flex items-center gap-2 font-semibold tracking-tight"><Logo />Marginalia</button>
        <div className="ml-2 text-sm"><BotState status={status} connection={connection} /></div>
        {status?.lastPoll && (
          <span className="hidden text-xs text-fg-muted md:inline">last poll {timeAgo(status.lastPoll.at)}</span>
        )}
        <button
          onClick={onOpenPalette}
          className="touch-target ml-auto flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-fg-muted hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          Search…
          <kbd className="flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800"><Command className="size-3" />K</kbd>
        </button>
        <button
          onClick={onSettings}
          aria-label="Settings"
          aria-current={settingsActive ? 'page' : undefined}
          title="Settings"
          className={`touch-target rounded-lg border p-2 hover:border-zinc-300 dark:hover:border-zinc-700 ${settingsActive ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-zinc-200 bg-white text-fg-muted dark:border-zinc-800 dark:bg-zinc-900'}`}
        >
          <Settings className="size-4" />
        </button>
      </div>
    </div>
  );
}
