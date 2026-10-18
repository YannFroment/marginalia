import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { claudeSettings, denyRules } = await import('../lib/claude-sandbox.mjs');
const { claudeEnv, claudeArgs } = await import('../lib/claude-cli.mjs');
const { CLAUDE_ALLOWED_TOOLS, CLAUDE_MR_COMMENTS_ALLOWED_TOOLS } = await import('../lib/allowed-tools.mjs');

const paths = {
  rootDir: '/bot',
  repoPath: '/repo',
  worktreeDir: '/bot/worktree',
  reviewsDir: '/repo/.claude/reviews',
  gitHost: 'git.example.com',
};

test('Bash is confined to the worktree, the repo git dir and the reviews, and reaches only the git host', () => {
  const { sandbox } = claudeSettings(paths);
  assert.equal(sandbox.enabled, true);
  assert.equal(sandbox.failIfUnavailable, true);
  assert.equal(sandbox.allowUnsandboxedCommands, false);
  assert.equal(sandbox.autoAllowBashIfSandboxed, false);
  assert.deepEqual(sandbox.filesystem.allowWrite, ['/bot/worktree', '/repo/.git', '/repo/.claude/reviews']);
  assert.deepEqual(sandbox.network.allowedDomains, ['git.example.com']);
  assert.ok(sandbox.filesystem.denyRead.includes('~/.ssh'));
  assert.ok(sandbox.filesystem.denyRead.includes('/bot/.env'));
});

test('CLAUDE_SANDBOX=false drops the sandbox but keeps the deny rules', () => {
  const settings = claudeSettings({ ...paths, sandbox: false });
  assert.equal(settings.sandbox, undefined);
  assert.ok(settings.permissions.deny.length > 0);
});

test('the tools that read secrets or rewrite trusted config are denied, in both .claude spellings', () => {
  const deny = denyRules(paths);
  for (const rule of [
    'Read(~/.ssh/**)',
    'Read(//bot/.env)',
    'Edit(~/.zshrc)',
    'Edit(//bot/lib/**)',
    'Edit(//repo/.claude/commands/**)',
    'Edit(//bot/worktree/.claude/commands/**)',
    'Edit(//repo/.claude/settings.json)',
    'Bash(git config:*)',
    'Bash(git -c:*)',
    'Bash(git push:*)',
  ]) assert.ok(deny.includes(rule), rule);
  assert.ok(!deny.some((r) => r.includes('.claude/reviews')), 'the reports stay writable');
});

test('no blanket git permission: only named subcommands, and commits only for the triage', () => {
  assert.ok(!CLAUDE_ALLOWED_TOOLS.includes('Bash(git:*)'));
  assert.ok(CLAUDE_ALLOWED_TOOLS.includes('Bash(git diff:*)'));
  assert.ok(!CLAUDE_ALLOWED_TOOLS.includes('Bash(git commit:*)'));
  assert.ok(CLAUDE_MR_COMMENTS_ALLOWED_TOOLS.includes('Bash(git commit:*)'));
});

test('the run gets no credential-looking variable unless passed through, but keeps its Claude login', () => {
  const env = { PATH: '/bin', GITLAB_TOKEN: 'a', JIRA_API_TOKEN: 'b', DB_PASSWORD: 'c', CLAUDE_CODE_OAUTH_TOKEN: 'd', MY_SECRET: 'e' };
  assert.deepEqual(claudeEnv(env), { PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 'd', MR_REVIEW_BOT: '1' });
  assert.equal(claudeEnv(env, ['MY_SECRET']).MY_SECRET, 'e');
});

test('the settings go to claude as one JSON argument', () => {
  const settings = claudeSettings(paths);
  const args = claudeArgs({ prompt: 'p', tools: ['Read'], systemPrompt: 's', settings });
  assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), settings);
  assert.ok(!claudeArgs({ prompt: 'p', tools: [], systemPrompt: 's' }).includes('--settings'));
});
