// The only Jira write of the suggestions: creating the ticket you clicked Post
// on, with the title and body as you left them, then reading it back.
import { SUGGEST_JIRA_PROJECT, SUGGEST_ISSUE_TYPE, suggestLabels, createEnabled } from './suggest-config.mjs';
import { jira, jiraBase } from './tickets-jira.mjs';
import { markdownToAdf } from './adf.mjs';
import { updateSuggestions } from './suggest.mjs';

export class PostError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function setItem(id, change) {
  return updateSuggestions((data) => ({ ...data, items: data.items.map((s) => (s.id === id ? { ...s, ...change(s) } : s)) }));
}

export async function dismissSuggestion(id) {
  const data = await setItem(id, (s) => (s.status === 'new' ? { status: 'dismissed', dismissedAt: new Date().toISOString() } : {}));
  if (!data.items.some((s) => s.id === id)) throw new PostError(404, 'no such suggestion');
}

// Creates the ticket once: a suggestion already posted, or being posted, is refused.
const inFlight = new Set();
export async function postSuggestion(id, { title, body }) {
  if (!createEnabled) throw new PostError(403, 'creating tickets is disabled (SUGGEST_ALLOW_CREATE)');
  if (inFlight.has(id)) throw new PostError(409, 'already being posted');
  inFlight.add(id);
  try {
    let found = null;
    await setItem(id, (s) => { found = s; return {}; });
    if (!found) throw new PostError(404, 'no such suggestion');
    if (found.status === 'posted') throw new PostError(409, `already posted as ${found.key}`);
    const summary = (title ?? found.title).trim();
    const text = (body ?? found.body).trim();
    if (!summary || !text) throw new PostError(400, 'title and body must not be empty');
    const fields = {
      project: { key: SUGGEST_JIRA_PROJECT },
      issuetype: { name: SUGGEST_ISSUE_TYPE },
      summary,
      description: markdownToAdf(text),
      ...(suggestLabels.length ? { labels: suggestLabels } : {}),
    };
    const created = await jira('/issue', { method: 'POST', body: { fields } });
    // Read back: a create that answered with a key but stored nothing would show as posted.
    const stored = await jira(`/issue/${created.key}?fields=summary`);
    const posted = { status: 'posted', key: created.key, url: `${jiraBase}/browse/${created.key}`, postedAt: new Date().toISOString(), title: stored.fields.summary, body: text };
    await setItem(id, () => posted);
    return posted;
  } finally {
    inFlight.delete(id);
  }
}
