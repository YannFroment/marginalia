import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { isBotAuthor } = await import('../lib/gitlab.mjs');

test('access token users are bots', () => {
  assert.equal(isBotAuthor({ username: 'group_106_bot_cf0760ce4441ac4c3f902ef9597b9cb5' }), true);
  assert.equal(isBotAuthor({ username: 'project_42_bot' }), true);
  assert.equal(isBotAuthor({ username: 'someone', bot: true }), true);
});

test('people are not bots', () => {
  assert.equal(isBotAuthor({ username: 'amanaranche' }), false);
  assert.equal(isBotAuthor({ username: 'robot_fan' }), false);
  assert.equal(isBotAuthor(undefined), false);
});
