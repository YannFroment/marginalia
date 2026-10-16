import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffPosition, findNoteIdByBody, isNotFound, latestPeerNoteAt, toDiscussions, toDraft } from '../lib/gitlab-notes.mjs';

const note = (id, username, at, extra = {}) => ({ id, author: { username, name: username.toUpperCase() }, body: `note ${id}`, created_at: at, updated_at: at, ...extra });

test('the latest peer note ignores system notes and my own', () => {
  const discussions = [
    { notes: [note(1, 'alice', '2026-01-01T10:00:00Z'), note(2, 'me', '2026-01-03T10:00:00Z')] },
    { notes: [note(3, 'bob', '2026-01-02T10:00:00Z'), note(4, 'bob', '2026-01-04T10:00:00Z', { system: true })] },
  ];
  assert.equal(latestPeerNoteAt(discussions, 'me'), Date.parse('2026-01-02T10:00:00Z'));
  assert.equal(latestPeerNoteAt([{ notes: [note(5, 'me', '2026-01-01T00:00:00Z')] }], 'me'), null);
});

test('a published note is found by its text, mine only', () => {
  const discussions = [{ notes: [note(1, 'alice', 'x', { body: 'same' }), note(2, 'me', 'x', { body: ' same \n' })] }];
  assert.equal(findNoteIdByBody(discussions, 'me', 'same'), 2);
  assert.equal(findNoteIdByBody(discussions, 'me', 'other'), null);
});

test('discussions keep human notes only, oldest thread first', () => {
  const discussions = [
    { id: 'b', notes: [note(3, 'me', '2026-01-02T00:00:00Z', { position: { new_path: 'a.ts', new_line: 4 } })] },
    { id: 'sys', notes: [note(9, 'bot', '2026-01-01T00:00:00Z', { system: true })] },
    { id: 'a', notes: [note(1, 'alice', '2026-01-01T00:00:00Z', { resolvable: true, resolved: true }), note(2, 'me', '2026-01-03T00:00:00Z')] },
  ];
  const out = toDiscussions(discussions, 'me');
  assert.deepEqual(out.map((d) => d.id), ['a', 'b']);
  assert.equal(out[0].resolved, true);
  assert.deepEqual(out[0].notes.map((n) => n.mine), [false, true]);
  assert.deepEqual([out[1].path, out[1].line], ['a.ts', 4]);
});

test('a thread says which side of the diff it is on and the commit it was opened on', () => {
  const on = (position) => toDiscussions([{ id: 'x', notes: [note(1, 'alice', '2026-01-01T00:00:00Z', { position })] }], 'me')[0];
  assert.deepEqual([on({ new_path: 'a.ts', new_line: 4, head_sha: 'h1' }).side, on({ new_path: 'a.ts', new_line: 4, head_sha: 'h1' }).headSha], ['new', 'h1']);
  assert.equal(on({ old_path: 'a.ts', old_line: 2 }).side, 'old');
  assert.equal(on(undefined).side, null);
});

test('a draft falls back on the old side of the diff', () => {
  assert.deepEqual(toDraft({ id: 7, note: 'hi', position: { old_path: 'x.ts', old_line: 3 } }), { id: 7, body: 'hi', path: 'x.ts', line: 3 });
  assert.deepEqual(toDraft({ id: 8, note: 'general' }), { id: 8, body: 'general', path: null, line: null });
});

test('a diff position anchors on the line, or on the whole file without one', () => {
  const refs = { base_sha: 'b', start_sha: 's', head_sha: 'h' };
  const files = [{ old_path: 'old.ts', new_path: 'new.ts', diff: '@@ -1,2 +1,3 @@\n a\n+b\n c\n' }];
  const onLine = diffPosition(refs, files, 'new.ts', 2);
  assert.equal(onLine.position_type, 'text');
  assert.equal(onLine.old_path, 'old.ts');
  assert.equal(onLine.new_line, 2);
  const onFile = diffPosition(refs, files, 'other.ts', null);
  assert.deepEqual(onFile, { position_type: 'file', base_sha: 'b', start_sha: 's', head_sha: 'h', old_path: 'other.ts', new_path: 'other.ts' });
});

test('only a 404 means the note is gone', () => {
  assert.equal(isNotFound(new Error('GitLab API /x -> 404: Not found')), true);
  assert.equal(isNotFound(new Error('GitLab API /x -> 500: boom')), false);
});

test('review app links from access-token bots are not reviewer feedback', () => {
  const discussions = [{ notes: [
    note(1, 'alice', '2026-01-01T10:00:00Z'),
    note(2, 'group_106_bot_cf0760ce4441ac4c3f902ef9597b9cb5', '2026-01-05T10:00:00Z'),
  ] }];
  assert.equal(latestPeerNoteAt(discussions, 'me'), Date.parse('2026-01-01T10:00:00Z'));
});
