import { test } from 'node:test';
import assert from 'node:assert/strict';

const { contested, mergeRevised } = await import('../lib/suggest-redo.mjs');

const items = [
  { id: 'a', status: 'new', title: 'A', body: 'a', check: { ok: false, problems: ['x'] } },
  { id: 'b', status: 'new', title: 'B', body: 'b', check: { ok: true, problems: [] } },
  { id: 'c', status: 'accepted', title: 'C', body: 'c', check: { ok: false, problems: ['y'] } },
  { id: 'd', status: 'new', title: 'D', body: 'd' },
];

test('only new drafts the verifier contested are rewritten', () => {
  assert.deepEqual(contested(items).map((s) => s.id), ['a']);
});

test('a rewrite lands on the stored item without undoing a Keep clicked meanwhile', () => {
  const revised = [{ id: 'a', status: 'new', title: 'A2', principle: 'p', files: ['f'], why: 'w', body: 'a2', sha: 's', check: { ok: true, problems: [], rounds: 1 }, revisedAt: 't' }];
  const kept = items.map((s) => (s.id === 'a' ? { ...s, status: 'accepted', acceptedAt: 'k' } : s));
  const merged = mergeRevised(kept, revised);
  assert.deepEqual(merged[0], { id: 'a', status: 'accepted', acceptedAt: 'k', title: 'A2', principle: 'p', files: ['f'], why: 'w', body: 'a2', sha: 's', check: { ok: true, problems: [], rounds: 1 }, revisedAt: 't' });
  assert.deepEqual(merged.slice(1), kept.slice(1));
});
