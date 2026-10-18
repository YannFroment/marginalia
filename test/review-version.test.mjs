import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRange, resolveReviewedVersion } from '../lib/review-version.mjs';

const v = (id, head, base, created_at) => ({ id, head_commit_sha: head, base_commit_sha: base, created_at });
const versions = [v(3, 'c3', 'b', '2026-03-01T10:00:00Z'), v(2, 'c2', 'b', '2026-02-01T10:00:00Z'), v(1, 'c1', 'b', '2026-01-01T10:00:00Z')];

test('a review that recorded its commit is matched exactly, even when GitLab no longer has the version', () => {
  assert.deepEqual(resolveReviewedVersion({ versions, sha: 'c2', at: 0 }), { sha: 'c2', version: versions[1], approximate: false });
  assert.deepEqual(resolveReviewedVersion({ versions, sha: 'gone', at: 0 }), { sha: 'gone', version: null, approximate: false });
});

test('an older review is matched to the newest version pushed before it was written', () => {
  const r = resolveReviewedVersion({ versions, sha: null, at: Date.parse('2026-02-15T00:00:00Z') });
  assert.deepEqual([r.sha, r.approximate], ['c2', true]);
  assert.deepEqual(resolveReviewedVersion({ versions, sha: null, at: Date.parse('2025-01-01T00:00:00Z') }), { sha: null, version: null, approximate: true });
  assert.equal(resolveReviewedVersion({ versions, sha: null, at: NaN }).sha, null);
});

test("'full' spans the reviewed version, 'since' runs from its commit to the head now", () => {
  const reviewed = { sha: 'c2', version: versions[1], approximate: false };
  assert.deepEqual(diffRange({ mode: 'full', reviewed, head: 'c3' }), { from: 'b', to: 'c2' });
  assert.deepEqual(diffRange({ mode: 'since', reviewed, head: 'c3' }), { from: 'c2', to: 'c3' });
});

test('a range that cannot be told says why instead of guessing', () => {
  assert.match(diffRange({ mode: 'full', reviewed: { sha: 'x', version: null }, head: 'c3' }).error, /no longer on GitLab/);
  assert.match(diffRange({ mode: 'since', reviewed: { sha: null, version: null }, head: 'c3' }).error, /before its version/);
  assert.match(diffRange({ mode: 'since', reviewed: { sha: 'c2', version: versions[1] }, head: null }).error, /no versions/);
});
