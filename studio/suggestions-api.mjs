// Routes of the suggested tickets, kept out of server.mjs: list, run, post, dismiss.
import { suggestEnabled, createEnabled, SUGGEST_JIRA_PROJECT } from '../lib/suggest-config.mjs';
import { readSuggestions, findSuggestions } from '../lib/suggest.mjs';
import { postSuggestion, dismissSuggestion, PostError } from '../lib/suggest-post.mjs';

const ID_RE = /^[0-9a-f-]{36}$/;
const MAX_BODY = 18_000;

export async function listSuggestions() {
  if (!suggestEnabled) return { enabled: false };
  const data = await readSuggestions();
  return { enabled: true, canPost: createEnabled, project: SUGGEST_JIRA_PROJECT, running: data.running, lastRun: data.lastRun, items: data.items.filter((s) => s.status !== 'dismissed') };
}

// Returns undefined when the request is not one of these routes.
export function handleSuggestions(req, res, pathname, { json, readJsonBody }) {
  if (req.method !== 'POST' || !pathname.startsWith('/api/suggestions/')) return undefined;
  if (!suggestEnabled) return json(res, 404, { error: 'suggestions are off (SUGGEST_JIRA_PROJECT)' });
  const action = pathname.slice('/api/suggestions/'.length);
  return (async () => {
    const input = await readJsonBody(req, res);
    if (input === null) return undefined;
    if (action === 'run') {
      // The run takes minutes: answer now, the list refreshes when it lands.
      findSuggestions().catch((err) => console.error('Suggestion run failed:', err.message));
      return json(res, 202, { running: true });
    }
    const { id, title, body } = input;
    if (typeof id !== 'string' || !ID_RE.test(id)) return json(res, 400, { error: 'bad id' });
    try {
      if (action === 'dismiss') {
        await dismissSuggestion(id);
        return json(res, 200, { dismissed: true });
      }
      if (action === 'post') {
        if ((title !== undefined && (typeof title !== 'string' || title.length > 250)) || (body !== undefined && (typeof body !== 'string' || body.length > MAX_BODY))) {
          return json(res, 400, { error: `title under 250 and body under ${MAX_BODY} characters` });
        }
        return json(res, 200, await postSuggestion(id, { title, body }));
      }
      return json(res, 404, { error: 'unknown action' });
    } catch (err) {
      if (err instanceof PostError) return json(res, err.code, { error: err.message });
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  })();
}
