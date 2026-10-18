import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FINDINGS_FILE } from '../lib/findings.mjs';
import { REPORT_FILE, buildReport, clearStaleReport, contractPrompt } from '../lib/report.mjs';

const exists = (p) => access(p).then(() => true, () => false);

test('the contract tells any command where to write both the report and the findings', () => {
  for (const kind of ['review', 'triage']) {
    const text = contractPrompt(kind, '', '/work/tree');
    assert.ok(text.includes(`/work/tree/${REPORT_FILE}`));
    assert.ok(text.includes(`/work/tree/${FINDINGS_FILE}`));
    for (const key of ['verdict', 'severity', 'title', 'path', 'line', 'body', 'comment']) assert.ok(text.includes(`"${key}"`), key);
    assert.match(text, /Never post, reply, or resolve anything on GitLab/);
  }
});

test('a triage is told to write everything in English, a review is left alone', () => {
  assert.match(contractPrompt('triage'), /Write everything in English/);
  assert.doesNotMatch(contractPrompt('review'), /Write everything in English/);
});

test('the findings file stays optional: a command that ignores it still gets a report', async () => {
  const d = await mkdtemp(join(tmpdir(), 'marginalia-'));
  await writeFile(join(d, REPORT_FILE), '**Verdict:** APPROVE\n\n## Suggestions\n\n- A thing in `src/a.ts`.\n');
  const r = await buildReport({ worktreeDir: d, stdout: '' });
  assert.equal(r.source, 'file');
  assert.equal(r.shape.source, 'markdown');
});

test('a stale report or findings file from a previous run is cleared before the next one', async () => {
  const d = await mkdtemp(join(tmpdir(), 'marginalia-'));
  await writeFile(join(d, REPORT_FILE), 'old');
  await writeFile(join(d, FINDINGS_FILE), '{}');
  await clearStaleReport(d);
  assert.equal(await exists(join(d, REPORT_FILE)), false);
  assert.equal(await exists(join(d, FINDINGS_FILE)), false);
});

test('findings without a report is still a failed run, not a silent empty review', async () => {
  const d = await mkdtemp(join(tmpdir(), 'marginalia-'));
  await writeFile(join(d, FINDINGS_FILE), '{"verdict":"APPROVE","findings":[]}');
  await assert.rejects(buildReport({ worktreeDir: d, stdout: 'ok' }), /no report/);
});
