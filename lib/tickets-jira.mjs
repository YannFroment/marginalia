import { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } from './config.mjs';

export const jiraBase = JIRA_BASE_URL.replace(/\/+$/, '');

export async function jira(path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const res = await fetch(`${jiraBase}/rest/api/3${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Jira ${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

// Atlassian Document Format to plain text, for the model and the tooltip.
export function adfText(node) {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  const inner = (node.content ?? []).map(adfText).join(node.type === 'doc' ? '\n' : '');
  return ['paragraph', 'heading', 'listItem', 'codeBlock'].includes(node.type) ? `${inner}\n` : inner;
}

// Every ticket of these projects that isn't done, newest change first.
export async function openTickets(projects) {
  const jql = `project in (${projects.join(',')}) AND statusCategory != Done ORDER BY updated DESC`;
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
