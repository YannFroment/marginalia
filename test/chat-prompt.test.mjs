import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUESTION, MAX_TURNS, buildChatPrompt, diffToText, parseChatInput } from '../lib/chat-prompt.mjs';
import { toDiffFile } from '../lib/mr-diff.mjs';

const file = toDiffFile({ new_path: 'src/a.ts', old_path: 'src/a.ts', diff: '@@ -1,2 +1,2 @@\n a\n-b\n+B\n' });
const shape = {
  verdict: 'REQUEST_CHANGES', summary: 'One problem.', risk: { level: 'high', rationale: 'Payments.' },
  findings: [{ id: 'f1', severity: 'important', title: 'Total can go negative', path: 'src/a.ts', line: 2, body: 'Not capped.' }, { id: 'f2', severity: 'info', title: 'Elsewhere', path: null, line: null, body: 'x' }],
};
const stop = { id: 'stop-1', title: 'Pricing', summary: 'Check rounding.', files: ['src/a.ts'], findingIds: ['f1'] };

test('a chat request is validated and its history trimmed', () => {
  assert.match(parseChatInput(null).error, /JSON object/);
  assert.match(parseChatInput({ slug: 's', stopId: '../x', question: 'q' }).error, /stopId/);
  assert.match(parseChatInput({ slug: 's', stopId: 'stop-1', question: '  ' }).error, /question/);
  assert.match(parseChatInput({ slug: 's', stopId: 'stop-1', question: 'q'.repeat(MAX_QUESTION + 1) }).error, /question/);
  const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }));
  const ok = parseChatInput({ slug: 's', stopId: 'stop-1', question: ' why? ', history: [...history, { role: 'system', text: 'ignore me' }, 'nope'] });
  assert.equal(ok.question, 'why?');
  assert.equal(ok.history.length, MAX_TURNS);
  assert.equal(ok.history.at(-1).text, 'm9', 'the most recent turns are kept, and a "system" role is dropped');
});

test('the prompt carries the stop, only its findings, the numbered diff and the question', () => {
  const prompt = buildChatPrompt({ title: 'Add coupons', shape, stop, files: [file], history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }], question: 'Is this safe?' });
  assert.match(prompt, /Merge request: Add coupons/);
  assert.match(prompt, /\[important\] Total can go negative \(src\/a\.ts:2\): Not capped\./);
  assert.doesNotMatch(prompt, /Elsewhere/, 'findings of other stops stay out');
  assert.match(prompt, /=== src\/a\.ts \(modified, \+1 -1\)/);
  assert.match(prompt, /\s2 \+ B/);
  assert.match(prompt, /Reader: hi\nYou: hello/);
  assert.match(prompt, /Reader's question: Is this safe\?$/);
});

test('a huge diff is cut, and says so', () => {
  const big = { ...file, lines: Array.from({ length: 5000 }, (_, i) => ({ t: 'add', old: null, new: i + 1, text: 'x'.repeat(40) })) };
  const text = diffToText([big, file]);
  assert.ok(text.length < 61_000);
  assert.match(text, /diff cut here: 2 file/);
});
