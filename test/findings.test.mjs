import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEVERITIES, buildShape, findingId, listFields, normalizeSeverity, normalizeVerdict, parseFindingsJson, parseVerdict,
} from '../lib/findings.mjs';

test('verdicts are understood in the ways a command writes them', () => {
  for (const [text, expected] of [
    ['REQUEST CHANGES', 'REQUEST_CHANGES'], ['request_changes', 'REQUEST_CHANGES'], ['Changes requested', 'REQUEST_CHANGES'],
    ['Needs work', 'REQUEST_CHANGES'], ['Demander des modifications', 'REQUEST_CHANGES'], ['Not approved', 'REQUEST_CHANGES'],
    ['APPROVE', 'APPROVE'], ['Approved', 'APPROVE'], ['approve with suggestions', 'APPROVE'], ['LGTM', 'APPROVE'], ['Approuvé', 'APPROVE'],
    ['Comment only', 'OTHER'], ['', null], [null, null],
  ]) assert.equal(normalizeVerdict(text), expected, String(text));
});

test('verdict lines tolerate the usual markdown variations', () => {
  assert.equal(parseVerdict('**Verdict:** APPROVE'), 'APPROVE');
  assert.equal(parseVerdict('**Verdict :** REQUEST CHANGES — see below'), 'REQUEST_CHANGES');
  assert.equal(parseVerdict('**Verdict**: Approve'), 'APPROVE');
  assert.equal(parseVerdict('**Décision :** Demander des changements'), 'REQUEST_CHANGES');
  assert.equal(parseVerdict('no verdict anywhere'), null);
});

test('severity names from other skills map onto the four we use', () => {
  for (const [name, expected] of [['Blocker', 'critical'], ['MAJOR', 'important'], ['nit', 'suggestion'], ['praise', 'info'], ['bloquant', 'critical'], ['whatever', null]]) {
    assert.equal(normalizeSeverity(name), expected, name);
  }
  for (const s of SEVERITIES) assert.equal(normalizeSeverity(s), s);
});

test('a finding keeps its id when the comment is reworded or the findings are reordered', () => {
  const a = { path: 'src/a.ts', title: 'Price mismatch on open', body: 'x' };
  assert.equal(findingId(a), findingId({ ...a, body: 'completely different wording' }));
  assert.equal(findingId(a), findingId({ ...a, title: 'price  mismatch on OPEN!' }), 'case, spacing and punctuation do not matter');
  assert.notEqual(findingId(a), findingId({ ...a, path: 'src/b.ts' }));
  assert.notEqual(findingId(a), findingId({ ...a, title: 'Another point' }));
});

test('ids survive a re-run whose markdown was reworded', () => {
  const run = (comment) => buildShape({
    markdown: `**Verdict:** REQUEST CHANGES\n\n## Critical\n\n- **Price mismatch on open** in \`src/a.ts:4\`.\n\n  > ${comment}\n`,
  }).findings[0];
  const first = run('The price differs.');
  const second = run('On open the price is not the card price; please align them.');
  assert.equal(first.id, second.id);
  assert.notEqual(first.comment, second.comment);
});

test('a findings file with the same id twice gets distinct ids', () => {
  const r = parseFindingsJson(JSON.stringify({ findings: [{ id: 'x', title: 'a' }, { id: 'x', title: 'b' }, { title: 'c' }, { title: 'c' }] }));
  assert.equal(new Set(r.findings.map((f) => f.id)).size, 4);
});

test('a findings file inside a code fence is accepted', () => {
  const r = parseFindingsJson('```json\n{"verdict":"APPROVE","findings":[]}\n```');
  assert.equal(r.ok, true);
  assert.equal(r.verdict, 'APPROVE');
});

test('garbage findings files are rejected with a reason, never thrown', () => {
  for (const raw of ['', 'nope', '[]', '"text"', 'null', '{"findings": 3}']) {
    const r = parseFindingsJson(raw);
    assert.equal(r.ok, false, raw);
    assert.ok(r.error);
  }
});

test('a path named only in the text still anchors the comment', () => {
  const r = parseFindingsJson(JSON.stringify({ findings: [{ title: 'Bug', body: 'In src/x/y.ts:9 the guard is wrong', comment: 'Fix it' }] }));
  assert.deepEqual([r.findings[0].path, r.findings[0].line], ['src/x/y.ts', 9]);
});

test('a line without a path is dropped, so a comment is never anchored on nothing', () => {
  const r = parseFindingsJson(JSON.stringify({ findings: [{ title: 'Bug', line: 3 }] }));
  assert.deepEqual([r.findings[0].path, r.findings[0].line], [null, null]);
});

test('URLs and bare names are not mistaken for repo paths', () => {
  const shape = buildShape({ markdown: '## Critical\n\n- See https://example.com/docs/page.html and Next.js for context.\n' });
  assert.equal(shape.findings[0].path, null);
});

test('findings inside a code fence are not findings', () => {
  const shape = buildShape({ markdown: '## Critical\n\n```md\n## Important\n- fake\n```\n' });
  assert.equal(shape.findings.length, 0);
});

test('the list fields are consistent with the findings', () => {
  const shape = buildShape({
    markdown: 'ignored',
    findingsRaw: JSON.stringify({ verdict: 'REQUEST_CHANGES', findings: [
      { severity: 'critical', title: 'a', comment: 'c1' }, { severity: 'critical', title: 'b' }, { severity: 'critical', title: 'c' },
      { severity: 'important', title: 'd', comment: 'c2' }, { severity: 'suggestion', title: 'e' },
    ] }),
  });
  const f = listFields(shape);
  assert.equal(f.critical, 3);
  assert.equal(f.important, 1);
  assert.equal(f.postable, 2);
  assert.equal(f.highlights.filter((h) => h.severity === 'critical').length, 2, 'at most two highlights per severity');
  assert.equal(f.contract.source, 'json');
});

test('risk and tour come through the findings file, with levels normalized', () => {
  const r = parseFindingsJson(JSON.stringify({
    verdict: 'APPROVE',
    risk: { level: 'Moderate', rationale: 'Touches checkout totals; tests cover the happy path only.', factors: ['payments', 'no negative-total test'] },
    tour: [
      { title: 'Pricing helper', summary: 'Rounding rules.', files: ['src/lib/pricing.ts'], findings: ['p1'] },
      { title: 'Checkout route', files: ['./src/app/api/checkout/route.ts'] },
      { title: '' },
    ],
    findings: [
      { id: 'p1', severity: 'important', title: 'Negative total', path: 'src/lib/pricing.ts' },
      { severity: 'critical', title: 'Client-side prices trusted', path: 'src/app/api/checkout/route.ts', line: 12 },
    ],
  }));
  assert.equal(r.risk.level, 'medium');
  assert.deepEqual(r.risk.factors, ['payments', 'no negative-total test']);
  assert.equal(r.tour.length, 2);
  assert.deepEqual(r.tour[0].findingIds, ['p1']);
  assert.equal(r.tour[1].findingIds.length, 1, 'a finding on a stop file is attached to that stop');
  assert.ok(r.warnings.some((w) => /tour stop #3/.test(w)));
});

test('a shape without risk or tour stays valid', () => {
  const shape = buildShape({ markdown: '**Verdict:** APPROVE\n\n## Suggestion\n\n- **Nit** in `src/a.ts:1`.\n' });
  assert.equal(shape.risk, null);
  assert.deepEqual(shape.tour, []);
  assert.equal(listFields(shape).risk, null);
  const bad = parseFindingsJson('{"risk":"scary","findings":[{"title":"x"}]}');
  assert.equal(bad.risk, null);
  assert.ok(bad.warnings.some((w) => /risk level/.test(w)));
});

test('the overview needs both a before and an after, in plain words', () => {
  const ok = parseFindingsJson(JSON.stringify({ overview: { before: 'Orders paid full price.', after: 'A coupon takes its percentage off.' }, findings: [{ title: 'x' }] }));
  assert.deepEqual(ok.overview, { before: 'Orders paid full price.', after: 'A coupon takes its percentage off.' });
  const half = parseFindingsJson(JSON.stringify({ overview: { before: 'Only a before.' }, findings: [{ title: 'x' }] }));
  assert.equal(half.overview, null);
  assert.ok(half.warnings.some((w) => /both "before" and "after"/.test(w)));
  assert.equal(parseFindingsJson('{"findings":[{"title":"x"}]}').overview, null, 'absent is fine');
});

test('tests, database and generated files are read last, whatever order the tour came in', () => {
  const stop = (title, ...files) => ({ title, files });
  const r = parseFindingsJson(JSON.stringify({
    tour: [
      stop('Tests', 'src/a/__tests__/a.test.ts', 'src/a/a.spec.ts'),
      stop('Migration', 'db/migrations/001_add_coupons.sql'),
      stop('Core', 'src/a/a.ts'),
      stop('Generated types', 'src/types/generated-schema.types.ts', 'pnpm-lock.yaml'),
      stop('Mixed: code and its test', 'src/b/b.ts', 'src/b/b.test.ts'),
      stop('No files yet'),
    ],
    findings: [{ title: 'x' }],
  }));
  assert.deepEqual(r.tour.map((s) => s.title), ['Core', 'Mixed: code and its test', 'No files yet', 'Tests', 'Migration', 'Generated types']);
  assert.deepEqual(r.tour.map((s) => s.supporting), [false, false, false, true, true, true]);
  assert.deepEqual(r.tour.map((s) => s.id), ['stop-1', 'stop-2', 'stop-3', 'stop-4', 'stop-5', 'stop-6'], 'ids follow the reading order');
});

test('chapters and overview that name code are flagged, plain ones and brand names are not', async () => {
  const { technicalWord } = await import('../lib/plain-words.mjs');
  for (const text of ['Replaces TrainsHelper.getJourneyTime', 'keyed on resource.type', 'the iata_code field', 'see src/app/a.ts', 'call getRate() first', 'uses `name`']) {
    assert.ok(technicalWord(text), text);
  }
  for (const text of ['Each kind of link gets its own fetch.', 'Works on iOS and GitLab, e.g. in PayPal flows.', 'A coupon takes its percentage off.']) {
    assert.equal(technicalWord(text), null, text);
  }
  const r = parseFindingsJson(JSON.stringify({
    overview: { before: 'Orders paid full price.', after: 'getCoupon() now applies a discount.' },
    tour: [{ title: 'A coupon takes its percentage off', summary: 'The total drops by the percentage. Check it never goes below zero.', files: ['a.ts'] }, { title: 'applyCoupon in pricing.ts', summary: 'x', files: ['b.ts'] }],
    findings: [{ title: 'x' }],
  }));
  assert.ok(r.warnings.some((w) => /overview names code \(getCoupon\(\)\)/.test(w)));
  assert.ok(r.warnings.some((w) => /1 of 2 chapters name code/.test(w) && /applyCoupon in pricing\.ts/.test(w)));
  assert.ok(parseFindingsJson(JSON.stringify({ tour: [{ title: 'Plain idea', files: ['a.ts'] }], findings: [{ title: 'x' }] })).warnings.some((w) => /no overview/.test(w)));
});
