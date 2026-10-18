import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threadsForFile } from '../studio/src/lib/threads.ts';

const file = {
  path: 'a.ts', oldPath: null,
  lines: [
    { t: 'hunk', text: '@@' },
    { t: 'ctx', old: 1, new: 1, text: 'a' },
    { t: 'del', old: 2, new: null, text: 'b' },
    { t: 'add', old: null, new: 2, text: 'B' },
  ],
};
const thread = (id, over) => ({ id, path: 'a.ts', line: 2, side: 'new', resolved: false, outdated: false, notes: [], ...over });

test('a thread sits under the line it is on, on the side it was opened on', () => {
  const { byLine, loose } = threadsForFile(file, [thread('n'), thread('o', { side: 'old' }), thread('c', { line: 1 })]);
  assert.deepEqual([...byLine].map(([i, ts]) => [i, ts.map((t) => t.id)]), [[3, ['n']], [2, ['o']], [1, ['c']]]);
  assert.deepEqual(loose, []);
});

test('a thread whose line left the diff, or that is on the whole file, is listed apart', () => {
  const { byLine, loose } = threadsForFile(file, [thread('gone', { line: 40 }), thread('file', { line: null }), thread('other', { path: 'b.ts' })]);
  assert.equal(byLine.size, 0);
  assert.deepEqual(loose.map((t) => t.id), ['gone', 'file']);
});
