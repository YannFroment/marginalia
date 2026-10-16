import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filesForPatterns, globToRegExp, parseDiff, toDiffFile } from '../lib/mr-diff.mjs';

const DIFF = '@@ -1,3 +1,4 @@ fn\n a\n-b\n+B\n+c\n d\n\\ No newline at end of file\n';

test('a unified diff becomes numbered lines on both sides', () => {
  const lines = parseDiff(DIFF);
  assert.deepEqual(lines.map((l) => [l.t, l.old, l.new]), [['hunk', undefined, undefined], ['ctx', 1, 1], ['del', 2, null], ['add', null, 2], ['add', null, 3], ['ctx', 3, 4]]);
  assert.equal(lines[3].text, 'B');
});

test('an empty or missing diff gives no lines, and a file says when GitLab omitted it', () => {
  assert.deepEqual(parseDiff(''), []);
  assert.deepEqual(parseDiff(undefined), []);
  const f = toDiffFile({ new_path: 'a.ts', old_path: 'a.ts', diff: '' });
  assert.equal(f.omitted, true);
  const g = toDiffFile({ new_path: 'b.ts', old_path: 'a.ts', renamed_file: true, diff: '' });
  assert.deepEqual([g.status, g.oldPath, g.omitted], ['renamed', 'a.ts', false]);
  const h = toDiffFile({ new_path: 'c.ts', old_path: 'c.ts', diff: DIFF });
  assert.deepEqual([h.additions, h.deletions, h.status], [2, 1, 'modified']);
});

test('stop patterns pick files by path or glob, in stop order, once each', () => {
  const files = ['src/a/x.ts', 'src/a/b/y.ts', 'src/z.ts', 'docs/d.md'].map((path) => ({ path }));
  assert.deepEqual(filesForPatterns(files, ['docs/d.md', 'src/a/**']).map((f) => f.path), ['docs/d.md', 'src/a/x.ts', 'src/a/b/y.ts']);
  assert.deepEqual(filesForPatterns(files, ['src/*.ts', 'src/z.ts']).map((f) => f.path), ['src/z.ts']);
  assert.equal(globToRegExp('a.b/*.ts').test('aXb/c.ts'), false, 'dots are literal');
  assert.deepEqual(filesForPatterns(files, ['nothing/**']), []);
});
