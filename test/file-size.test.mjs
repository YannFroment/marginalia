import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LINES, countLines, isGuarded, oversized } from '../scripts/check-file-size.mjs';

test(`every module of lib/ stays under ${MAX_LINES} lines`, () => {
  assert.deepEqual(oversized(), [], `split these modules: ${oversized().map((o) => `${o.file} (${o.lines})`).join(', ')}`);
});

test('the guard covers lib/ modules, in the repo and in its worktrees', () => {
  assert.equal(isGuarded('/r/lib/gitlab.mjs', '/r'), true);
  assert.equal(isGuarded('/r/.claude/worktrees/x/lib/a.mjs', '/r'), true);
  assert.equal(isGuarded('/r/studio/src/lib/api.ts', '/r'), false);
  assert.equal(isGuarded('/r/poll.mjs', '/r'), false);
});

test('a trailing newline is not a line', () => {
  assert.equal(countLines('a\nb\n'), 2);
  assert.equal(countLines('a\nb'), 2);
});
