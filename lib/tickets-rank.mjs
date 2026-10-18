// How the Tickets tab orders tickets and what it calls "changed". Pure, so it is
// tested on plain fixtures.

const BLOCKED = /block|specify|investigat|won't|wont/i;

// Nobody on it, not started, and not waiting on something else.
export function isTakeable(ticket) {
  return !ticket.assignee && ticket.status.category === 'new' && !BLOCKED.test(ticket.status.name);
}

const STALE_DAYS = 180;
const OUTDATED = /outdated|obsolete|deprecated/i;

// Nobody has touched it for six months, or its title says it is outdated: it
// stays listed, but below the tickets someone could really pick up.
export function isStale(ticket, now = Date.now()) {
  return OUTDATED.test(ticket.summary) || now - Date.parse(ticket.updated) > STALE_DAYS * 86_400_000;
}

// Lower sorts first: priority, then how close to "ready to take" the status is.
export function rankOf(ticket, priorityRank) {
  const { category, name } = ticket.status;
  const statusRank = category === 'indeterminate' ? 0 : /selected|to do|daily/i.test(name) ? 1 : /backlog/i.test(name) ? 2 : 3;
  return (priorityRank.get(ticket.priority?.id) ?? 9) * 10 + statusRank;
}

// What moved since the previous refresh, in a few words each.
export function changesSince(before, ticket) {
  if (!before) return ['new'];
  return [
    before.status.name !== ticket.status.name && `status: ${before.status.name} > ${ticket.status.name}`,
    (before.assignee?.name ?? null) !== (ticket.assignee?.name ?? null) && `assignee: ${ticket.assignee?.name ?? 'nobody'}`,
    (before.priority?.name ?? null) !== (ticket.priority?.name ?? null) && `priority: ${ticket.priority?.name ?? 'none'}`,
    before.mrs.length !== ticket.mrs.length && `MRs: ${ticket.mrs.length}`,
  ].filter(Boolean);
}
