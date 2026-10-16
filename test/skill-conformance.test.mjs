// Whatever command or skill writes the review, the bot must hand the studio the
// same normalized shape. Each folder in test/fixtures/skills is one way of
// writing a review:
//   report.md       what the command wrote to .marginalia-report.md
//   stdout.txt      what it printed (when it wrote no report file)
//   findings.json   what it wrote to .marginalia-findings.json, if anything
//   expect.json     what the studio must get out of it
// The invariants checked for every fixture are the contract; expect.json adds
// the particular numbers for that fixture. To support a new way of writing
// reviews, add a folder: no code changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDINGS_FILE, NO_FINDINGS_WARNING, SEVERITIES, VERDICTS, listFields, loadShape } from '../lib/findings.mjs';
import { REPORT_FILE, buildReport, writeReportFiles } from '../lib/report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'skills');
const read = (path) => readFile(path, 'utf8').catch(() => null);
const exists = (path) => access(path).then(() => true, () => false);

async function run(name) {
  const dir = join(ROOT, name);
  const worktree = await mkdtemp(join(tmpdir(), 'marginalia-skill-'));
  const [report, stdout, findings, expect] = await Promise.all(['report.md', 'stdout.txt', 'findings.json', 'expect.json'].map((f) => read(join(dir, f))));
  if (report !== null) await writeFile(join(worktree, REPORT_FILE), report);
  if (findings !== null) await writeFile(join(worktree, FINDINGS_FILE), findings);
  const built = await buildReport({ worktreeDir: worktree, stdout: stdout ?? '' });
  return { worktree, built, expect: JSON.parse(expect) };
}

const fixtures = (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

test('there are fixtures to run against', () => {
  assert.ok(fixtures.length >= 8);
});

for (const name of fixtures) {
  test(`${name}: the shape honours the contract`, async () => {
    const { built, worktree } = await run(name);
    const { shape } = built;

    assert.equal(shape.version, 1);
    assert.ok(['json', 'markdown', 'none'].includes(shape.source));
    assert.ok(shape.verdict === null || VERDICTS.includes(shape.verdict), `verdict ${shape.verdict}`);
    assert.ok(Array.isArray(shape.findings));
    assert.ok(Array.isArray(shape.warnings) && shape.warnings.every((w) => typeof w === 'string' && w));
    assert.ok(shape.summary === null || (typeof shape.summary === 'string' && shape.summary.length <= 400));

    const ids = new Set();
    for (const f of shape.findings) {
      assert.match(f.id, /^[\w-]{1,64}$/, 'an id the server accepts as a commentId');
      assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
      ids.add(f.id);
      assert.ok(SEVERITIES.includes(f.severity), `severity ${f.severity}`);
      assert.ok(typeof f.title === 'string' && f.title.length > 0 && f.title.length <= 300);
      assert.ok(typeof f.body === 'string' && f.body.length > 0);
      assert.ok(f.path === null || (typeof f.path === 'string' && !f.path.startsWith('./') && !f.path.includes('\0')), `path ${f.path}`);
      assert.ok(f.line === null || (Number.isInteger(f.line) && f.line >= 1 && f.path !== null), `line ${f.line} on ${f.path}`);
      assert.ok(f.comment === null || (typeof f.comment === 'string' && f.comment.trim() && f.comment.length <= 10_000));
    }
    if (shape.source === 'none') {
      assert.deepEqual(shape.findings, []);
      assert.ok(shape.warnings.includes(NO_FINDINGS_WARNING), 'an unstructured report is never silent about it');
    }

    // Both files of the run are consumed, so the next run cannot read stale ones.
    assert.equal(await exists(join(worktree, REPORT_FILE)), false);
    assert.equal(await exists(join(worktree, FINDINGS_FILE)), false);

    assert.deepEqual(JSON.parse(JSON.stringify(shape)), shape, 'plain JSON');
  });

  test(`${name}: the studio gets what the fixture expects`, async () => {
    const { built, expect } = await run(name);
    const { shape } = built;
    assert.equal(shape.source, expect.source);
    assert.equal(shape.verdict, expect.verdict);
    for (const s of SEVERITIES) {
      assert.equal(shape.findings.filter((f) => f.severity === s).length, expect.counts[s], `${s} findings`);
    }
    const fields = listFields(shape);
    assert.equal(fields.postable, expect.postable);
    assert.equal(fields.critical, expect.counts.critical);
    assert.equal(fields.important, expect.counts.important);
    for (const want of expect.locations ?? []) {
      const found = shape.findings.find((f) => f.title === want.title);
      assert.ok(found, `finding "${want.title}" in [${shape.findings.map((f) => f.title).join(' | ')}]`);
      assert.deepEqual([found.path, found.line], [want.path, want.line], want.title);
    }
    for (const part of expect.warnings ?? []) {
      assert.ok(shape.warnings.some((w) => w.includes(part)), `a warning containing "${part}" in ${JSON.stringify(shape.warnings)}`);
    }
  });

  test(`${name}: the files written for the studio read back identically`, async () => {
    const { built } = await run(name);
    const reviews = await mkdtemp(join(tmpdir(), 'marginalia-reviews-'));
    await writeReportFiles(join(reviews, 'feat-x.md'), built);
    assert.equal(await readFile(join(reviews, 'feat-x.md'), 'utf8'), built.content);
    const stored = await loadShape(reviews, 'feat-x', built.content);
    assert.deepEqual({ ...stored, generatedAt: undefined }, { ...built.shape, generatedAt: undefined });
    assert.ok(!Number.isNaN(Date.parse(stored.generatedAt)));
  });

  test(`${name}: running it twice gives the same findings and ids`, async () => {
    const a = (await run(name)).built.shape;
    const b = (await run(name)).built.shape;
    assert.deepEqual(a, b);
  });
}

test('a shape stored by the bot is used as is; a review without one is read from its markdown', async () => {
  const reviews = await mkdtemp(join(tmpdir(), 'marginalia-reviews-'));
  const legacy = await loadShape(reviews, 'old', '**Verdict:** APPROVE\n\n## Suggestions\n\n- Tidy `src/a.ts:1`.\n');
  assert.equal(legacy.source, 'markdown');
  assert.equal(legacy.verdict, 'APPROVE');
  assert.equal(legacy.findings.length, 1);
});

test('guided-tour: risk and tour reach the studio, and a finding on a stop file joins that stop', async () => {
  const { shape } = (await run('guided-tour')).built;
  assert.equal(shape.risk.level, 'high');
  assert.equal(listFields(shape).risk, 'high');
  assert.equal(shape.overview.before.startsWith('A coupon code was ignored'), true);
  assert.deepEqual(shape.tour.map((s) => s.title), ['Pricing helper', 'Checkout API endpoint', 'Tests for the coupon rules'], 'the tests chapter was written first and is read last');
  assert.equal(shape.tour[2].supporting, true);
  const byTitle = (t) => shape.findings.find((f) => f.title === t).id;
  assert.deepEqual(shape.tour[0].findingIds, [byTitle('Total can go negative')]);
  assert.deepEqual(shape.tour[1].findingIds, [byTitle('Client prices are trusted')]);
});
