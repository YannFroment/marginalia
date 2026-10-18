import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, GitMerge, GitPullRequest, Inbox } from 'lucide-react';
import type { Ticket, TicketMr, TicketsPayload } from '../lib/api';
import { cn } from '../lib/utils';
import { SuggestedTickets } from './SuggestedTickets';

const SEEN_KEY = 'marginalia:tickets-seen';

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* private window: unread marks just reset */
  }
}

const MR_STYLE: Record<TicketMr['state'], string> = {
  opened: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  merged: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  closed: 'bg-zinc-500/10 text-fg-muted line-through',
  locked: 'bg-zinc-500/10 text-fg-muted',
};

function MrChip({ mr }: { mr: TicketMr }) {
  const Icon = mr.state === 'merged' ? GitMerge : GitPullRequest;
  const repo = mr.project.split('/').pop();
  return (
    <a href={mr.webUrl} target="_blank" rel="noreferrer" title={`${mr.title} (${mr.state}${mr.direct ? '' : ', only cited in its description'})`} className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs hover:underline', MR_STYLE[mr.state], !mr.direct && 'opacity-60')}>
      <Icon className="size-3" aria-hidden />{repo}!{mr.iid}<span className="sr-only">, {mr.state}</span>
    </a>
  );
}

function TicketRow({ ticket, unread }: { ticket: Ticket; unread: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-white px-4 py-3 text-sm hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60">
      <span className={unread ? 'size-2 shrink-0 rounded-full bg-blue-500' : 'size-2 shrink-0'} aria-hidden />
      <a href={ticket.url} target="_blank" rel="noreferrer" title={ticket.excerpt || undefined} className="min-w-0 flex-1 basis-72 font-medium hover:underline">
        <span className="mr-2 font-mono text-xs text-fg-muted">{ticket.key}</span>
        {ticket.summary}
        {unread && <span className="sr-only"> (changed since your last visit)</span>}
        <ExternalLink className="ml-1 inline size-3 text-fg-muted" aria-hidden />
      </a>
      {ticket.priority && <span className="text-xs text-fg-muted">{ticket.priority.name}</span>}
      <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-xs">{ticket.status.name}</span>
      <span className="text-xs text-fg-muted">{ticket.assignee ? (ticket.assignee.me ? 'You' : ticket.assignee.name) : 'Unassigned'}</span>
      {ticket.mrs.map((mr) => <MrChip key={`${mr.project}!${mr.iid}`} mr={mr} />)}
      {ticket.changes.length > 0 && <span className="w-full pl-5 text-xs text-amber-700 dark:text-amber-300">{ticket.changes.join(' · ')}</span>}
      {ticket.front && <span className="w-full pl-5 text-xs text-fg-muted">{ticket.front.front ? 'Front-end' : 'Not front-end'}: {ticket.front.reason}</span>}
    </li>
  );
}

function Section({ title, tickets, isUnread }: { title: string; tickets: Ticket[]; isUnread: (t: Ticket) => boolean }) {
  if (!tickets.length) return null;
  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">{title} · {tickets.length}</h2>
      <ul className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {tickets.map((t) => <TicketRow key={t.key} ticket={t} unread={isUnread(t)} />)}
      </ul>
    </section>
  );
}

// The Jira tickets of the configured boards for one person: theirs first, then
// the front-end ones they could take, then front-end work in other hands.
export function TicketsBoard({ payload }: { payload: TicketsPayload | null }) {
  const [board, setBoard] = useState<string>('all');
  const [frontOnly, setFrontOnly] = useState(true);
  const [seen, setSeen] = useState(loadSeen);
  const tickets = payload?.data?.tickets ?? [];
  const isUnread = (t: Ticket) => seen[t.key] !== t.updated;

  const scoped = useMemo(() => tickets.filter((t) => board === 'all' || t.project === board), [tickets, board]);
  const mine = scoped.filter((t) => t.mine);
  const pool = scoped.filter((t) => !t.mine && (!frontOnly || t.front?.front));
  const takeable = pool.filter((t) => t.takeable && !t.stale);
  const stale = pool.filter((t) => t.takeable && t.stale);
  const elsewhere = pool.filter((t) => !t.takeable && t.status.category === 'indeterminate');

  const markAllSeen = () => {
    const next = { ...seen, ...Object.fromEntries(tickets.map((t) => [t.key, t.updated])) };
    setSeen(next);
    saveSeen(next);
  };

  if (!payload) return <p className="mt-8 text-fg-muted">Loading…</p>;
  if (!payload.enabled) return <p className="mt-8 text-fg-muted">The Tickets tab needs JIRA_TICKET_PROJECTS and the Jira settings in .env.</p>;
  if (!payload.data) return <p className="mt-8 text-fg-muted">First fetch from Jira in progress…</p>;

  const projects = ['all', ...payload.data.projects];
  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Board" className="flex flex-wrap rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
          {projects.map((p) => (
            <button key={p} role="radio" aria-checked={board === p} onClick={() => setBoard(p)} className={cn('touch-target rounded-md px-2.5 py-1 text-sm', board === p ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-fg-muted hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
              {p === 'all' ? 'All boards' : p}
            </button>
          ))}
        </div>
        <label className="ml-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={frontOnly} onChange={(e) => setFrontOnly(e.target.checked)} />
          Front-end only
        </label>
        <button onClick={markAllSeen} className="touch-target ml-auto rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-zinc-100 dark:hover:bg-zinc-800">Mark all as seen</button>
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        Fetched {new Date(payload.data.fetchedAt).toLocaleString()} · {tickets.length} open tickets · moving your tickets to done once in prod is {payload.autoDone ? 'on' : 'off'}
      </p>

      {mine.length + takeable.length + elsewhere.length + stale.length === 0 && <div className="mt-16 flex flex-col items-center gap-2 text-fg-muted"><Inbox className="size-8" />No tickets on this board.</div>}
      <Section title="Yours" tickets={mine} isUnread={isUnread} />
      <Section title="You could take" tickets={takeable} isUnread={isUnread} />
      <Section title="In progress elsewhere" tickets={elsewhere} isUnread={isUnread} />
      {stale.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-fg-muted">Untouched for six months or marked outdated · {stale.length}</summary>
          <ul className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {stale.map((t) => <TicketRow key={t.key} ticket={t} unread={isUnread(t)} />)}
          </ul>
        </details>
      )}

      {payload.suggestions && <SuggestedTickets payload={payload.suggestions} />}

      {payload.done.length > 0 && (
        <section className="mt-8" aria-label="Moved to done">
          <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Moved to done automatically</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {payload.done.map((d) => (
              <li key={`${d.key}-${d.at}`} className="flex items-center gap-2">
                <CheckCircle2 className={cn('size-4', d.done ? 'text-emerald-600' : 'text-amber-600')} aria-hidden />
                <span className="font-mono text-xs">{d.key}</span>
                <span className="text-fg-muted">{d.done ? `${d.from} > ${d.to}` : d.reason}, {new Date(d.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
