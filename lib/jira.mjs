import { JIRA_API_TOKEN, JIRA_BASE_URL, JIRA_EMAIL } from './config.mjs';

export const jiraEnabled = Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN);

const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

// The ticket key is looked for in the title, then the branch, then the
// description: teams name it in different places.
export function jiraKeyOf(mr) {
  for (const text of [mr.title, mr.source_branch?.toUpperCase(), mr.description]) {
    const m = KEY_RE.exec(text ?? '');
    if (m) return m[1];
  }
  return null;
}

async function jiraRequest(path) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const res = await fetch(`${JIRA_BASE_URL.replace(/\/+$/, '')}/rest/api/3${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira ${path} -> ${res.status}`);
  return res.json();
}

// Jira lists priorities in the order the site configured them, most urgent
// first, so the index is the rank. Fetched once per process.
let ranks = null;
async function priorityRanks() {
  ranks ??= jiraRequest('/priority').then((list) => new Map(list.map((p, i) => [p.id, i])));
  return ranks;
}

// { key, priority, rank } for the MR's ticket, or null when Jira isn't
// configured, the MR names no ticket, or the lookup fails (logged, never fatal).
export async function jiraPriorityOf(mr) {
  if (!jiraEnabled) return null;
  const key = jiraKeyOf(mr);
  if (!key) return null;
  try {
    const [issue, byId] = await Promise.all([jiraRequest(`/issue/${key}?fields=priority`), priorityRanks()]);
    const p = issue.fields?.priority;
    return { key, priority: p?.name ?? null, rank: p ? byId.get(p.id) ?? null : null };
  } catch (err) {
    console.warn(`[jira] ${key}: ${err.message}`);
    return { key, priority: null, rank: null };
  }
}

// Most urgent ticket first, MRs without a known priority last; ties keep the
// newest review first.
export function byPriorityThenDate(a, b) {
  const ra = a.jira?.rank ?? Infinity;
  const rb = b.jira?.rank ?? Infinity;
  if (ra !== rb) return ra - rb;
  return b.reviewedAt.localeCompare(a.reviewedAt);
}
