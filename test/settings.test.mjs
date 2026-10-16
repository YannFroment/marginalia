import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.ALLOWED_TARGET_BRANCHES = 'develop, main';
process.env.EXCLUDE_AUTHORS = 'Alice';
process.env.STALE_AFTER_DAYS = '10';
const dir = await mkdtemp(join(tmpdir(), 'marginalia-settings-'));
process.env.REPO_LOCAL_PATH = dir;
process.env.SETTINGS_FILE = join(dir, 'settings.json');

const { SETTINGS_FILE } = await import('../lib/config.mjs');
const { loadSettings, saveSettings, allowedTargets, excludedAuthors, staleAfterDays } = await import('../lib/settings.mjs');

test('without settings.json, .env gives the values', () => {
  assert.deepEqual(allowedTargets(), ['develop', 'main']);
  assert.ok(excludedAuthors().has('alice'));
  assert.equal(staleAfterDays(), 10);
});

test('a saved value wins at once and only the changed keys are written', async () => {
  await saveSettings({ staleAfterDays: 3, allowedTargetBranches: [] });
  assert.equal(staleAfterDays(), 3);
  assert.deepEqual(allowedTargets(), []);
  assert.ok(excludedAuthors().has('alice'));
  assert.deepEqual(JSON.parse(await readFile(SETTINGS_FILE, 'utf8')), { staleAfterDays: 3, allowedTargetBranches: [] });
});

test('null puts a key back on its .env default', async () => {
  await saveSettings({ allowedTargetBranches: null });
  assert.deepEqual(loadSettings().allowedTargetBranches, ['develop', 'main']);
});

test('invalid input is refused and nothing changes', async () => {
  await assert.rejects(saveSettings({ staleAfterDays: 0 }), /staleAfterDays/);
  await assert.rejects(saveSettings({ excludeAuthors: ['a b'] }), /excludeAuthors/);
  await assert.rejects(saveSettings({ allowPosting: true }), /unknown setting/);
  assert.equal(staleAfterDays(), 3);
});
