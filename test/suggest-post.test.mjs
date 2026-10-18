import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A fake Jira: records what is created and answers the read-back.
const created = [];
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  res.setHeader('content-type', 'application/json');
  if (req.method === 'POST' && req.url === '/rest/api/3/issue') {
    created.push(JSON.parse(raw));
    return res.end(JSON.stringify({ key: `ABC-${900 + created.length}` }));
  }
  const read = req.url.match(/^\/rest\/api\/3\/issue\/(ABC-\d+)\?fields=summary$/);
  if (req.method === 'GET' && read) return res.end(JSON.stringify({ fields: { summary: created.at(-1).fields.summary } }));
  res.statusCode = 404;
  return res.end('{}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const dir = await mkdtemp(join(tmpdir(), 'suggest-'));
const file = join(dir, 'suggestions.json');
const id = '11111111-2222-3333-4444-555555555555';
await writeFile(file, JSON.stringify({ lastRun: null, items: [
  { id, title: '[FE] Cart: keep filters', body: '## Context\n\n:::warning\n**Lost.**\n:::', status: 'new', files: [] },
  { id: id.replace('1111', '9999'), title: 'other', body: 'x', status: 'new', files: [] },
] }));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', SUGGESTIONS_FILE: file, SUGGEST_JIRA_PROJECT: 'ABC', SUGGEST_ALLOW_CREATE: 'true',
  SUGGEST_LABELS: 'frontend', JIRA_BASE_URL: `http://127.0.0.1:${server.address().port}`, JIRA_EMAIL: 'a@b', JIRA_API_TOKEN: 't',
});
const { postSuggestion, dismissSuggestion } = await import('../lib/suggest-post.mjs');

test('Post creates the ticket with the edited title, ADF body and labels, then marks it posted', async () => {
  const posted = await postSuggestion(id, { title: '[FE] Cart: keep the filters', body: '## Context\n\n:::warning\n**Lost.**\n:::' });
  assert.equal(posted.key, 'ABC-901');
  assert.match(posted.url, /\/browse\/ABC-901$/);
  const { fields } = created[0];
  assert.deepEqual([fields.project.key, fields.issuetype.name, fields.summary, fields.labels], ['ABC', 'Story', '[FE] Cart: keep the filters', ['frontend']]);
  assert.equal(fields.description.type, 'doc');
  assert.equal(fields.description.content[1].type, 'panel');
  const saved = JSON.parse(await readFile(file, 'utf8')).items.find((s) => s.id === id);
  assert.deepEqual([saved.status, saved.key, saved.title], ['posted', 'ABC-901', '[FE] Cart: keep the filters']);
});

test('a posted suggestion is never created twice, and dismissing it does nothing', async () => {
  await assert.rejects(postSuggestion(id, {}), (err) => err.code === 409);
  await dismissSuggestion(id);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).items.find((s) => s.id === id).status, 'posted');
  assert.equal(created.length, 1);
});

test('an unknown suggestion and an empty title are refused before any request', async () => {
  await assert.rejects(postSuggestion('00000000-0000-0000-0000-000000000000', {}), (err) => err.code === 404);
  await assert.rejects(postSuggestion(id.replace('1111', '9999'), { title: '  ' }), (err) => err.code === 400);
  assert.equal(created.length, 1);
  server.close();
});
