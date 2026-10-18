import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, fetchJson } from '../studio/src/lib/fetchRetry.ts';

const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function stubFetch(...steps) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  return calls;
}

test('a server that is busy or restarting is tried again until it answers', async () => {
  const calls = stubFetch(new TypeError('Failed to fetch'), answer(503, { error: 'warming up' }), answer(200, { ok: true }));
  assert.deepEqual(await fetchJson('/api/x'), { ok: true });
  assert.equal(calls.length, 3, 'a network failure, a 503, then the answer');
});

test('an answer that says no is final: a 404 is not retried', async () => {
  const calls = stubFetch(answer(404, { error: 'not found' }));
  await assert.rejects(() => fetchJson('/api/x'), (e) => e instanceof HttpError && e.status === 404 && e.message === 'not found');
  assert.equal(calls.length, 1);
});

test('it gives up after the retries it was allowed, with the last error', async () => {
  const calls = stubFetch(answer(503, { error: 'still down' }));
  await assert.rejects(() => fetchJson('/api/x', { retries: 1 }), /still down/);
  assert.equal(calls.length, 2, 'the try and one retry');
});

test('a cancelled fetch stops at once instead of waiting to retry', async () => {
  stubFetch(answer(503, { error: 'down' }));
  const controller = new AbortController();
  const started = Date.now();
  const pending = fetchJson('/api/x', { signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(() => pending);
  assert.ok(Date.now() - started < 300, 'it did not sit out the retry pause');
});
