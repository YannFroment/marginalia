// Tickets tab: the open Jira tickets of JIRA_TICKET_PROJECTS, linked to the
// GitLab MRs that name them, sorted for TICKET_PROFILE, written to tickets.json.
// The model that tells front-end tickets apart runs once per ticket (cached in
// ticket-classes.json); everything else is plain API calls.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, GITLAB_USERNAME } from './config.mjs';
import { TICKET_PROFILE, TICKETS_FILE, TICKET_CLASSES_FILE, ticketProjects, doneStatusOf } from './tickets-config.mjs';
import { jira, jiraBase, adfText, openTickets } from './tickets-jira.mjs';
import { mrsByKey } from './tickets-mrs.mjs';
import { obviousClass, classify } from './tickets-classify.mjs';
import { rankOf, isTakeable, isStale, changesSince } from './tickets-rank.mjs';

export const ticketsEnabled = Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN && ticketProjects.length);

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 1));
  await rename(`${file}.tmp`, file);
}

function toTicket({ key, fields, text }, mrs, front, me) {
  const assignee = fields.assignee ? { name: fields.assignee.displayName, me: fields.assignee.accountId === me } : null;
  const ticket = {
    key,
    url: `${jiraBase}/browse/${key}`,
    project: fields.project.key,
    type: fields.issuetype?.name ?? null,
    summary: fields.summary,
    excerpt: text.slice(0, 400),
    status: { name: fields.status.name, category: fields.status.statusCategory?.key ?? null },
    priority: fields.priority ? { id: fields.priority.id, name: fields.priority.name } : null,
    assignee,
    labels: fields.labels,
    updated: fields.updated,
    created: fields.created,
    mrs,
    front,
    mine: Boolean(assignee?.me) || mrs.some((mr) => mr.direct && mr.author === GITLAB_USERNAME),
  };
  return { ...ticket, takeable: isTakeable(ticket), stale: isStale(ticket) };
}

export async function refreshTickets() {
  if (!ticketsEnabled) return null;
  const started = Date.now();
  const [raw, byKey, me, priorities] = await Promise.all([openTickets(ticketProjects), mrsByKey(), jira('/myself'), jira('/priority')]);
  const priorityRank = new Map(priorities.map((p, i) => [p.id, i]));
  const previous = new Map(((await readJson(TICKETS_FILE, null))?.tickets ?? []).map((t) => [t.key, t]));
  const classes = await readJson(TICKET_CLASSES_FILE, {});

  const enriched = raw.map((issue) => ({ key: issue.key, fields: issue.fields, text: adfText(issue.fields.description).trim() }));
  // Rules win over a cached answer of the model: a title prefix or a label can
  // be added after the ticket was first classified.
  for (const t of enriched) {
    const rule = obviousClass(t, byKey.get(t.key) ?? []);
    if (rule) classes[t.key] = { ...rule, at: classes[t.key]?.by === 'rule' ? classes[t.key].at : new Date().toISOString() };
  }
  const spent = await classify(enriched, classes);
  await writeJson(TICKET_CLASSES_FILE, classes);

  const tickets = enriched.map((t) => {
    const ticket = toTicket(t, byKey.get(t.key) ?? [], classes[t.key] ?? null, me.accountId);
    return { ...ticket, rank: rankOf(ticket, priorityRank), changes: changesSince(previous.get(t.key), ticket) };
  }).sort((a, b) => a.rank - b.rank || b.updated.localeCompare(a.updated));

  const data = {
    fetchedAt: new Date().toISOString(),
    projects: ticketProjects,
    profile: TICKET_PROFILE,
    doneStatuses: doneStatusOf,
    classifierCostUsd: spent,
    seconds: Math.round((Date.now() - started) / 1000),
    tickets,
  };
  await writeJson(TICKETS_FILE, data);
  return data;
}
