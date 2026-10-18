// Tickets tab: the open Jira tickets of JIRA_TICKET_PROJECTS, linked to the
// GitLab MRs that name them, sorted for TICKET_PROFILE, written to tickets.json.
// The model that tells front-end tickets apart runs once per ticket (cached in
// ticket-classes.json); everything else is plain API calls.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import {
  JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_TICKET_PROJECTS, TICKET_MR_PROJECTS, GITLAB_PROJECT_ID,
  GITLAB_USERNAME, PROD_MANIFEST, JIRA_DONE_STATUSES, TICKET_PROFILE, TICKET_CLASSIFY_MODEL, CLAUDE_BIN,
  TICKETS_FILE, TICKET_CLASSES_FILE,
} from './config.mjs';
import { gitlabRequest, gitlabRaw } from './gitlab.mjs';

export const ticketProjects = JIRA_TICKET_PROJECTS.split(',').map((s) => s.trim()).filter(Boolean);
export const ticketsEnabled = Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN && ticketProjects.length);

export const doneStatusOf = Object.fromEntries(JIRA_DONE_STATUSES.split(',').map((pair) => pair.split('=').map((s) => s.trim())).filter(([k, v]) => k && v));

export const mrProjects = (TICKET_MR_PROJECTS || GITLAB_PROJECT_ID).split(',').map((entry) => {
  const [path, manifestName] = entry.split('=').map((s) => s.trim());
  return { path, id: encodeURIComponent(path), manifestName: manifestName || null };
}).filter((p) => p.path);

const KEYS_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const MR_DAYS = 120;
const CLASSIFY_BATCH = 20;
const CLASSIFY_BATCHES_PER_RUN = 20;

export async function jira(path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const res = await fetch(`${JIRA_BASE_URL.replace(/\/+$/, '')}/rest/api/3${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Jira ${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

// Atlassian Document Format to plain text, for the model and the tooltip.
function adfText(node) {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  const inner = (node.content ?? []).map(adfText).join(node.type === 'doc' ? '\n' : '');
  return ['paragraph', 'heading', 'listItem', 'codeBlock'].includes(node.type) ? `${inner}\n` : inner;
}

async function openTickets() {
  const jql = `project in (${ticketProjects.join(',')}) AND statusCategory != Done ORDER BY updated DESC`;
  const fields = 'summary,status,priority,assignee,reporter,labels,issuetype,updated,created,project,description';
  const out = [];
  let token;
  do {
    const q = new URLSearchParams({ jql, fields, maxResults: '100', ...(token ? { nextPageToken: token } : {}) });
    const page = await jira(`/search/jql?${q}`);
    out.push(...page.issues);
    token = page.nextPageToken;
  } while (token);
  return out;
}

// Ticket key -> MRs that name it (title, branch or description), over the last
// MR_DAYS days of every project in TICKET_MR_PROJECTS.
async function mrsByKey() {
  const since = new Date(Date.now() - MR_DAYS * 86_400_000).toISOString();
  const byKey = new Map();
  for (const project of mrProjects) {
    for (let page = 1; page <= 20; page += 1) {
      const mrs = await gitlabRequest(`/projects/${project.id}/merge_requests?state=all&updated_after=${since}&per_page=100&page=${page}`);
      for (const mr of mrs) {
        const direct = new Set([...`${mr.title} ${mr.source_branch.toUpperCase()}`.matchAll(KEYS_RE)].map((m) => m[1]));
        const keys = new Set([...direct, ...[...(mr.description ?? '').matchAll(KEYS_RE)].map((m) => m[1])]);
        for (const key of keys) {
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push({
            project: project.path, manifestName: project.manifestName, iid: mr.iid, title: mr.title, state: mr.state,
            author: mr.author?.username, webUrl: mr.web_url, mergedAt: mr.merged_at,
            mergeSha: mr.merge_commit_sha || mr.squash_commit_sha || null,
            // Named in the title or branch: the MR does this ticket's work. Only
            // cited in the description: it may just refer to it.
            direct: direct.has(key),
          });
        }
      }
      if (mrs.length < 100) break;
    }
  }
  return byKey;
}

// Service -> tag currently in prod, from PROD_MANIFEST.
export async function prodTags() {
  if (!PROD_MANIFEST) return {};
  const [project, ref, ...path] = PROD_MANIFEST.split(':');
  const text = await gitlabRaw(`/projects/${encodeURIComponent(project)}/repository/files/${encodeURIComponent(path.join(':'))}/raw?ref=${encodeURIComponent(ref)}`);
  return Object.fromEntries(text.split('\n').map((l) => l.split(':').map((s) => s.trim())).filter(([k, v]) => k && v && !k.startsWith('#')));
}

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

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const { ANTHROPIC_API_KEY: _unused, ...env } = process.env;
    const child = spawn(CLAUDE_BIN, ['-p', prompt, '--model', TICKET_CLASSIFY_MODEL, '--output-format', 'json', '--setting-sources', '', '--tools', ''], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const res = JSON.parse(out);
        resolve({ text: res.result ?? '', costUsd: res.total_cost_usd ?? null });
      } catch {
        reject(new Error(`classifier exited ${code}`));
      }
    });
  });
}

// What the labels and linked MRs already say; null when the model must decide.
function obviousClass(ticket, mrs) {
  const prefix = ticket.fields.summary.match(/^\s*\[(FE|BE|Front[\w-]*|Back[\w-]*)\b/i)?.[1]?.toLowerCase();
  if (prefix) return { front: prefix.startsWith('f'), reason: 'title prefix', by: 'rule' };
  const labels = ticket.fields.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => ['frontend', 'front', 'fe', 'front-end'].includes(l))) return { front: true, reason: 'label', by: 'rule' };
  if (labels.some((l) => ['backend', 'back', 'be', 'back-end'].includes(l))) return { front: false, reason: 'label', by: 'rule' };
  const front = mrProjects[0]?.path;
  if (mrs.some((mr) => mr.direct && mr.project === front)) return { front: true, reason: `MR in ${front}`, by: 'rule' };
  return null;
}

async function classify(tickets, classes) {
  const todo = tickets.filter((t) => !classes[t.key]);
  let spent = 0;
  for (let i = 0; i < Math.min(todo.length, CLASSIFY_BATCH * CLASSIFY_BATCHES_PER_RUN); i += CLASSIFY_BATCH) {
    const batch = todo.slice(i, i + CLASSIFY_BATCH);
    const list = batch.map((t) => `### ${t.key} [${t.fields.project.key}, ${t.fields.issuetype?.name}] ${t.fields.summary}\nLabels: ${t.fields.labels.join(', ') || 'none'}\n${t.text.slice(0, 1200)}`).join('\n\n');
    const prompt = `You sort Jira tickets for ${TICKET_PROFILE}. For each ticket below, decide whether its main work is front-end (user interface code: the web app, its design system, or a browser front end) or not (back end, data, infra, ops, product or content work). Answer with a JSON array only, one object per ticket: {"key": "...", "front": true|false, "reason": "<at most 12 words, English>"}.\n\n${list}`;
    try {
      const { text, costUsd } = await runClaude(prompt);
      spent += costUsd ?? 0;
      const answers = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
      for (const a of answers) {
        if (batch.some((t) => t.key === a.key)) classes[a.key] = { front: Boolean(a.front), reason: String(a.reason ?? '').slice(0, 120), by: TICKET_CLASSIFY_MODEL, at: new Date().toISOString() };
      }
    } catch (err) {
      console.warn(`[tickets] classification batch failed: ${err.message}`);
      break;
    }
  }
  return spent;
}

const BLOCKED = /block|specify|investigat|won't|wont/i;

// Lower sorts first: priority, then how close to "ready to take" the status is.
function rankOf(t, priorityRank) {
  const cat = t.status.category;
  const statusRank = cat === 'indeterminate' ? 0 : /selected|to do|daily/i.test(t.status.name) ? 1 : /backlog/i.test(t.status.name) ? 2 : 3;
  return (priorityRank.get(t.priority?.id) ?? 9) * 10 + statusRank;
}

export async function refreshTickets() {
  if (!ticketsEnabled) return null;
  const started = Date.now();
  const [raw, byKey, me, priorities] = await Promise.all([openTickets(), mrsByKey(), jira('/myself'), jira('/priority')]);
  const priorityRank = new Map(priorities.map((p, i) => [p.id, i]));
  const previous = new Map(((await readJson(TICKETS_FILE, null))?.tickets ?? []).map((t) => [t.key, t]));
  const classes = await readJson(TICKET_CLASSES_FILE, {});

  const enriched = raw.map((issue) => ({ key: issue.key, fields: issue.fields, text: adfText(issue.fields.description).trim() }));
  // Rules win over a cached answer of the model: a title prefix or a label
  // can be added after the ticket was first classified.
  for (const t of enriched) {
    const rule = obviousClass(t, byKey.get(t.key) ?? []);
    if (rule) classes[t.key] = { ...rule, at: classes[t.key]?.by === 'rule' ? classes[t.key].at : new Date().toISOString() };
  }
  const spent = await classify(enriched, classes);
  await writeJson(TICKET_CLASSES_FILE, classes);

  const tickets = enriched.map(({ key, fields, text }) => {
    const mrs = byKey.get(key) ?? [];
    const assignee = fields.assignee ? { name: fields.assignee.displayName, me: fields.assignee.accountId === me.accountId } : null;
    const ticket = {
      key,
      url: `${JIRA_BASE_URL.replace(/\/+$/, '')}/browse/${key}`,
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
      front: classes[key] ?? null,
      mine: Boolean(assignee?.me) || mrs.some((mr) => mr.direct && mr.author === GITLAB_USERNAME),
    };
    ticket.takeable = !assignee && ticket.status.category === 'new' && !BLOCKED.test(ticket.status.name);
    ticket.rank = rankOf(ticket, priorityRank);
    const before = previous.get(key);
    ticket.changes = !before ? ['new'] : [
      before.status.name !== ticket.status.name && `status: ${before.status.name} > ${ticket.status.name}`,
      (before.assignee?.name ?? null) !== (assignee?.name ?? null) && `assignee: ${assignee?.name ?? 'nobody'}`,
      (before.priority?.name ?? null) !== (ticket.priority?.name ?? null) && `priority: ${ticket.priority?.name ?? 'none'}`,
      before.mrs.length !== mrs.length && `MRs: ${mrs.length}`,
    ].filter(Boolean);
    return ticket;
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
