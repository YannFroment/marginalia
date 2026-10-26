import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildRewritePrompt, parseOneSuggestion, reviseUntilClean } = await import('../lib/suggest-revise.mjs');

const draft = { title: '[FE] Cart: keep filters', principle: 'p', files: ['a.tsx:3'], why: 'w', body: '## Context\n\nline 3 is 30px' };

test('the rewrite prompt carries the objections, the draft and the template', () => {
  const prompt = buildRewritePrompt(draft, ['"line 3 is 30px": the code says 24px'], 'TEMPLATE');
  for (const part of ['the code says 24px', '[FE] Cart: keep filters', '### Principle\n\np', '### Why\n\nw', 'a.tsx:3', '## Context', 'TEMPLATE', 'JSON']) assert.ok(prompt.includes(part), part);
  assert.ok(!prompt.includes('"principle"'), 'the principle is not asked for');
  assert.ok(!buildRewritePrompt(draft, ['x'], '').includes('## Template'));
});

test('one rewritten draft is read from the answer, or nothing', () => {
  const s = parseOneSuggestion('Here it is:\n{"title":"T","files":["b.tsx:1", 2],"body":"B","why":"w"}');
  assert.deepEqual(s, { title: 'T', principle: '', files: ['b.tsx:1'], why: 'w', body: 'B' });
  assert.equal(parseOneSuggestion('{"title":"no body"}'), null);
  assert.equal(parseOneSuggestion('not json'), null);
});

test('a contested draft goes back to its writer until the verifier is satisfied', async () => {
  const calls = [];
  const verify = async (d) => { calls.push(`verify:${d.body}`); return d.body === 'fixed' ? { ok: true, problems: [] } : { ok: false, problems: ['wrong'] }; };
  const write = async (d, problems) => { calls.push(`write:${problems.join()}`); return { ...d, body: 'fixed', principle: 'the rewrite rule' }; };
  const out = await reviseUntilClean(draft, { write, verify, rounds: 2 });
  assert.equal(out.draft.body, 'fixed');
  assert.equal(out.draft.title, draft.title);
  assert.equal(out.draft.principle, 'p', 'the principle is the reference, it survives the rewrite');
  assert.deepEqual(out.check, { ok: true, problems: [], rounds: 1 });
  assert.deepEqual(calls, ['verify:## Context\n\nline 3 is 30px', 'write:wrong', 'verify:fixed']);
});

test('the loop stops after the allowed rounds and shows the draft contested', async () => {
  let writes = 0;
  const verify = async () => ({ ok: false, problems: ['still wrong'] });
  const write = async (d) => { writes += 1; return { ...d, body: `try ${writes}` }; };
  const out = await reviseUntilClean(draft, { write, verify, rounds: 2 });
  assert.equal(writes, 2);
  assert.deepEqual(out.check, { ok: false, problems: ['still wrong'], rounds: 2 });
  assert.equal(out.draft.body, 'try 2');
});

test('a clean draft is never rewritten, and an unreadable rewrite ends the loop', async () => {
  let writes = 0;
  const clean = await reviseUntilClean(draft, { write: async () => { writes += 1; return draft; }, verify: async () => ({ ok: true, problems: [] }), rounds: 2 });
  assert.equal(writes, 0);
  assert.deepEqual(clean.check, { ok: true, problems: [], rounds: 0 });
  const stuck = await reviseUntilClean(draft, { write: async () => null, verify: async () => ({ ok: false, problems: ['x'] }), rounds: 2 });
  assert.deepEqual(stuck.check, { ok: false, problems: ['x'], rounds: 0 });
  assert.equal(stuck.draft, draft);
});
