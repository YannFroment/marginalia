import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStep, runStreaming } from '../lib/progress.mjs';

test('tool calls read as plain steps', () => {
  assert.equal(describeStep({ type: 'tool_use', name: 'mcp__chrome-devtools__navigate_page', input: { url: 'https://a.test/?channel=X' } }), 'Opening https://a.test/?channel=X');
  assert.equal(describeStep({ type: 'tool_use', name: 'mcp__chrome-devtools__click', input: { uid: '1_2' } }), 'Clicking on the page');
  assert.equal(describeStep({ type: 'tool_use', name: 'Bash', input: { command: 'ra-check 3799\necho done' } }), '$ ra-check 3799');
  assert.equal(describeStep({ type: 'tool_use', name: 'Read', input: { file_path: '/x/y/Dockerfile' } }), 'Reading Dockerfile');
});

test('the run narration keeps its first sentence', () => {
  assert.equal(describeStep({ type: 'text', text: 'I log in as an agent. Then I open the trip.' }), 'I log in as an agent.');
  assert.equal(describeStep({ type: 'text', text: '   ' }), null);
});

test('streamed events give the steps and the final result', async () => {
  const events = [
    { type: 'system', subtype: 'init' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Opening the app.' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'result', result: '# Report', total_cost_usd: 0.5 },
  ];
  const script = `process.stdout.write(${JSON.stringify(events.map((e) => JSON.stringify(e)).join('\n'))})`;
  const steps = [];
  const { stdout } = await runStreaming(process.execPath, ['-e', script], {}, (s) => steps.push(s));
  assert.deepEqual(steps, ['Opening the app.', '$ ls']);
  assert.equal(JSON.parse(stdout).result, '# Report');
});
