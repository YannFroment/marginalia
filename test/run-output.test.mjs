import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { parseRunOutput } = await import('../lib/claude-runner.mjs');

test('the final event gives the final message and the run cost', () => {
  const stdout = JSON.stringify({ type: 'result', result: '# Report', total_cost_usd: 1.25, num_turns: 12, duration_ms: 9000, usage: { output_tokens: 3400 } });
  assert.deepEqual(parseRunOutput(stdout), { text: '# Report', stats: { costUsd: 1.25, outputTokens: 3400, turns: 12, durationMs: 9000 } });
});

test('anything else is kept as plain text', () => {
  assert.deepEqual(parseRunOutput('plain text'), { text: 'plain text', stats: null });
  assert.deepEqual(parseRunOutput('{"no":"result"}'), { text: '{"no":"result"}', stats: null });
});
