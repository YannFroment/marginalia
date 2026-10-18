// The studio's API must give the same kind of answer for a review written by any
// skill. Each fixture of test/fixtures/skills is run through the bot's report
// pipeline, dropped into a temporary reviews folder, and read back over HTTP; the
// answers are checked against the keys the OpenAPI document promises.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.ALLOW_POSTING = 'false';
process.env.STUDIO_PORT = '0';
const repo = await mkdtemp(join(tmpdir(), 'marginalia-api-'));
process.env.REPO_LOCAL_PATH = repo;

const { REVIEWS_DIR } = await import('../lib/config.mjs');
const { FINDINGS_FILE } = await import('../lib/findings.mjs');
const { REPORT_FILE, buildReport, writeReportFiles } = await import('../lib/report.mjs');
const { startStudio } = await import('../studio/server.mjs');

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, 'fixtures', 'skills');
const openapi = await readFile(join(here, '..', 'studio', 'public', 'openapi.yaml'), 'utf8');

// `required: [a, b]` of one schema in the OpenAPI document.
function required(schema) {
  const block = openapi.split(new RegExp(`^    ${schema}:\\n`, 'm'))[1]?.split(/^    \w/m)[0] ?? '';
  const list = block.match(/required: \[([^\]]*)\]/)?.[1];
  assert.ok(list, `required keys of ${schema} in openapi.yaml`);
  return list.split(',').map((k) => k.trim());
}

const names = (await readdir(FIXTURES, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
await mkdir(REVIEWS_DIR, { recursive: true });
for (const name of names) {
  const worktree = await mkdtemp(join(tmpdir(), 'marginalia-wt-'));
  const read = (f) => readFile(join(FIXTURES, name, f), 'utf8').catch(() => null);
  const [report, stdout, findings] = await Promise.all([read('report.md'), read('stdout.txt'), read('findings.json')]);
  if (report !== null) await writeFile(join(worktree, REPORT_FILE), report);
  if (findings !== null) await writeFile(join(worktree, FINDINGS_FILE), findings);
  await writeReportFiles(join(REVIEWS_DIR, `${name}.md`), await buildReport({ worktreeDir: worktree, stdout: stdout ?? '' }));
}

const server = startStudio();
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());
const get = (path) => fetch(`${base}${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));

test('every review is listed with the keys the API promises, whichever skill wrote it', async () => {
  const { status, body } = await get('/api/reviews');
  assert.equal(status, 200);
  const items = body.items.filter((i) => names.includes(i.slug));
  assert.equal(items.length, names.length, 'no review is dropped from the list');
  for (const item of items) {
    for (const key of required('ReviewItem')) {
      // These come from GitLab, which these untracked fixtures have no merge request in.
      if (['iid', 'author', 'webUrl', 'branch', 'stackId', 'jira', 'mtime', 'reviewedAt', 'tracked', 'stale', 'crossLayer', 'kind', 'title'].includes(key)) continue;
      assert.ok(key in item, `${item.slug} has ${key}`);
    }
    assert.ok(['json', 'markdown', 'none'].includes(item.contract.source));
    assert.ok(Array.isArray(item.contract.warnings));
    assert.ok(Number.isInteger(item.critical) && Number.isInteger(item.important) && Number.isInteger(item.postable));
    assert.ok(item.verdict === null || ['APPROVE', 'REQUEST_CHANGES', 'OTHER'].includes(item.verdict));
  }
});

test('every review can be read with its shape', async () => {
  for (const name of names) {
    const { status, body } = await get(`/api/reviews/${name}`);
    assert.equal(status, 200, name);
    for (const key of required('ReviewShape')) assert.ok(key in body.shape, `${name} shape has ${key}`);
    assert.equal(typeof body.markdown, 'string');
    for (const f of body.shape.findings) for (const key of required('Finding')) assert.ok(key in f, `${name} finding has ${key}`);
  }
});

test('a review written before shapes were stored is still listed and readable', async () => {
  await writeFile(join(REVIEWS_DIR, 'legacy.md'), '**Verdict:** APPROVE\n\n## Suggestions\n\n- Tidy `src/a.ts:1`.\n');
  const { body } = await get('/api/reviews/legacy');
  assert.equal(body.shape.source, 'markdown');
  assert.equal(body.shape.verdict, 'APPROVE');
});
