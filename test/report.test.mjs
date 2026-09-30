import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractReport, REPORT_FILE } from '../lib/report.mjs';

const dir = () => mkdtemp(join(tmpdir(), 'mrbot-'));
const long = 'x'.repeat(300);

test('report file wins', async () => {
  const d = await dir();
  await writeFile(join(d, REPORT_FILE), '# From file');
  const r = await extractReport({ worktreeDir: d, stdout: '<<<REVIEW_FILE path="a">>>\nblock\n<<<END_REVIEW_FILE>>>' });
  assert.deepEqual(r, { content: '# From file', source: 'file' });
});

test('marker block', async () => {
  const r = await extractReport({ worktreeDir: await dir(), stdout: '<<<REVIEW_FILE path="a">>>\nblock\n<<<END_REVIEW_FILE>>>' });
  assert.deepEqual(r, { content: 'block', source: 'block' });
});

test('raw stdout fallback', async () => {
  const r = await extractReport({ worktreeDir: await dir(), stdout: long });
  assert.equal(r.source, 'stdout');
  assert.match(r.content, /Non-standard output/);
});

test('empty output fails', async () => {
  await assert.rejects(extractReport({ worktreeDir: await dir(), stdout: 'ok' }), /no report/);
});

test('refused tool is actionable', async () => {
  await assert.rejects(
    extractReport({ worktreeDir: await dir(), stdout: 'Error: tool mcp__foo__bar is not allowed' }),
    /CLAUDE_EXTRA_ALLOWED_TOOLS/,
  );
});
