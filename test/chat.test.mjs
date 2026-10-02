import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChats } from '../lib/chat.mjs';

// A fake Claude: asks permission for one command, then answers with the decision it got.
const FAKE = `#!/usr/bin/env node
const rl = require('node:readline').createInterface({ input: process.stdin });
const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
rl.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.type === 'user') out({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'git commit -m x' }, decision_reason: 'commit asks' } });
  if (msg.type === 'control_response') out({ type: 'result', result: msg.response.response.behavior, total_cost_usd: 0.1, session_id: 's' });
});
`;

const bin = join(await mkdtemp(join(tmpdir(), 'chat-')), 'claude');
await writeFile(bin, FAKE);
await chmod(bin, 0o755);

for (const allow of [true, false]) {
  test(`a permission prompt waits for ${allow ? 'Allow' : 'Deny'} on the page`, async () => {
    const chats = createChats({ bin, cwd: process.cwd(), env: process.env, args: [] });
    const events = [];
    const done = new Promise((resolve) => chats.listen('k', (e) => {
      events.push(e);
      if (e.type === 'permission') chats.answer('k', e.ask.id, allow);
      if (e.type === 'answer') resolve(e);
    }));
    chats.send('k', 'sid', { iid: 1 }, 'commit please');
    const answer = await done;
    chats.close('k');
    assert.equal(events.find((e) => e.type === 'permission').ask.input.command, 'git commit -m x');
    assert.equal(answer.text, allow ? 'allow' : 'deny');
    assert.equal(chats.answer('k', 'r1', true), false);
  });
}
