import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnchor, positionForLine } from '../lib/diff-position.mjs';

const diff = [
  '@@ -1,4 +1,5 @@',
  ' FROM node:22',
  '-ARG A=1',
  '+ARG A=2',
  '+ARG B=3',
  ' RUN build',
  ' COPY . .',
  '@@ -20,2 +21,2 @@',
  ' EXPOSE 3000',
  '-CMD old',
  '+CMD new',
].join('\n');

test('anchor on the first line of the comment', () => {
  assert.deepEqual(parseAnchor('**Line:** `Dockerfile:2`\nThe pin is right.'), { path: 'Dockerfile', line: 2, body: 'The pin is right.' });
  assert.deepEqual(parseAnchor('Line: src/a/b.ts:42\nBody'), { path: 'src/a/b.ts', line: 42, body: 'Body' });
});

test('no anchor keeps a general comment', () => {
  assert.equal(parseAnchor('The pin is right.'), null);
  assert.equal(parseAnchor('See `Dockerfile:2` below.'), null);
});

test('added line needs new_line only', () => {
  assert.deepEqual(positionForLine(diff, 2), { new_line: 2 });
  assert.deepEqual(positionForLine(diff, 22), { new_line: 22 });
});

test('context line needs old_line and new_line', () => {
  assert.deepEqual(positionForLine(diff, 1), { old_line: 1, new_line: 1 });
  assert.deepEqual(positionForLine(diff, 4), { old_line: 3, new_line: 4 });
  assert.deepEqual(positionForLine(diff, 21), { old_line: 20, new_line: 21 });
});

test('line outside the diff is refused', () => {
  assert.equal(positionForLine(diff, 10), null);
  assert.equal(positionForLine(diff, 99), null);
});
