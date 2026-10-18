import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const dir = await mkdtemp(join(tmpdir(), 'marginalia-history-'));
process.env.REPO_LOCAL_PATH = dir;
const { REVIEWS_DIR } = await import('../lib/config.mjs');
const { archiveReview, listHistory, readHistory, discussionPrompt } = await import('../lib/history.mjs');
const { mkdir } = await import('node:fs/promises');
await mkdir(REVIEWS_DIR, { recursive: true });

test('a re-run keeps the review it replaces, and only when the content changed', async () => {
  const path = join(REVIEWS_DIR, 'feat-x.md');
  assert.equal(await archiveReview(path, 'new'), null, 'nothing to keep on a first review');
  await writeFile(path, 'first review');
  assert.equal(await archiveReview(path, 'first review'), null, 'identical content is not a new version');
  const id = await archiveReview(path, 'second review');
  assert.ok(id);
  const versions = await listHistory('feat-x');
  assert.equal(versions.length, 1);
  assert.equal(versions[0].id, id);
  assert.ok(!Number.isNaN(Date.parse(versions[0].at)));
  assert.deepEqual(await readHistory('feat-x', id), { markdown: 'first review', shape: null });
  assert.deepEqual((await readdir(REVIEWS_DIR)).filter((n) => n.endsWith('.md')), ['feat-x.md'], 'versions stay out of the review list');
});

test('history ids cannot escape the history directory', async () => {
  assert.equal(await readHistory('feat-x', '../feat-x'), null);
});

test('the conversation prompt carries replies and says who spoke', () => {
  assert.equal(discussionPrompt([]), '');
  const text = discussionPrompt([{ path: 'a.ts', line: 3, resolved: false, notes: [{ mine: true, author: 'me', body: 'Check this' }, { mine: false, author: 'dev', body: 'Fixed in abc' }] }]);
  assert.match(text, /a\.ts:3/);
  assert.match(text, /me \(the reviewer\): Check this/);
  assert.match(text, /dev: Fixed in abc/);
});

test('a version id says when it was written', async () => {
  const { versionTime } = await import('../lib/history.mjs');
  assert.equal(versionTime('2026-03-01T10-20-30-456Z'), '2026-03-01T10:20:30.456Z');
});

test('the commit a review was run on is stored with it and kept when the review is replaced', async () => {
  const { writeReportFiles } = await import('../lib/report.mjs');
  const { loadShape, buildShape } = await import('../lib/findings.mjs');
  const path = join(REVIEWS_DIR, 'feat-sha.md');
  const report = { content: 'a review', shape: buildShape({ markdown: 'a review' }) };
  await writeReportFiles(path, report, 'abc123');
  assert.equal((await loadShape(REVIEWS_DIR, 'feat-sha', '')).reviewedSha, 'abc123');
  const id = await archiveReview(path, 'the next review');
  assert.equal((await readHistory('feat-sha', id)).shape.reviewedSha, 'abc123');
  await writeReportFiles(path, report);
  assert.equal((await loadShape(REVIEWS_DIR, 'feat-sha', '')).reviewedSha, undefined, 'no sha, no field');
});
