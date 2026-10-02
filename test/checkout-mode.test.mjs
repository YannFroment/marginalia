import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.BOT_CHECKOUT = 'detached';
const { branchCheckedOutElsewhere } = await import('../lib/worktree.mjs');

test('in detached mode a branch open elsewhere never blocks the bot', async () => {
  assert.equal(await branchCheckedOutElsewhere('any/branch'), false);
});
