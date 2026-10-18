import { join } from 'node:path';

// The settings every headless run gets through `claude --settings`. Pure (no
// config or I/O import), so it is unit-tested on plain paths.
//
// Two layers, because they cover different tools: `sandbox` confines what Bash
// commands can touch (OS-level), while `permissions.deny` is the only thing
// that restricts the Read/Edit/Write tools, which run outside the sandbox.

const SECRET_DIRS = ['.ssh', '.aws', '.gnupg', '.kube', '.docker', '.config/gh'];
const SHELL_FILES = ['.zshrc', '.zprofile', '.zshenv', '.bashrc', '.bash_profile', '.profile'];
// Where the commands, agents and hooks your own sessions trust live. The review
// reaches them through the worktree's .claude symlink, so both spellings are denied.
const TRUSTED_CLAUDE_DIRS = ['commands', 'agents', 'skills', 'hooks'];
const TRUSTED_CLAUDE_FILES = ['settings.json', 'settings.local.json'];
// The bot's own code and secrets. Its worktree may live under it, so no blanket rule.
const BOT_PATHS = ['lib/**', 'scripts/**', 'swiftbar/**', 'poll.mjs', '.env'];

// Permission rules: `//` is an absolute path, `~/` the home directory.
const absolute = (path) => `/${path}`;

// Git subcommands that can run arbitrary code or leave the machine.
const DENIED_GIT = ['git config', 'git -c', 'git push'];

export function denyRules({ rootDir, repoPath, worktreeDir }) {
  const rules = [
    ...SECRET_DIRS.map((dir) => `Read(~/${dir}/**)`),
    ...SHELL_FILES.map((file) => `Edit(~/${file})`),
    'Edit(~/.claude/**)',
    'Edit(~/Library/LaunchAgents/**)',
    `Read(${absolute(join(rootDir, '.env'))})`,
    ...BOT_PATHS.map((path) => `Edit(${absolute(join(rootDir, path))})`),
    ...DENIED_GIT.map((cmd) => `Bash(${cmd}:*)`),
  ];
  for (const base of [repoPath, worktreeDir].filter(Boolean)) {
    for (const dir of TRUSTED_CLAUDE_DIRS) rules.push(`Edit(${absolute(join(base, '.claude', dir))}/**)`);
    for (const file of TRUSTED_CLAUDE_FILES) rules.push(`Edit(${absolute(join(base, '.claude', file))})`);
  }
  return [...new Set(rules)];
}

// `gitHost` is the only network host Bash may reach. autoAllowBashIfSandboxed is
// off so the allowed-tools list, not the sandbox, decides which commands run.
export function sandboxSettings({ rootDir, repoPath, worktreeDir, reviewsDir, gitHost }) {
  return {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: false,
    filesystem: {
      allowWrite: [worktreeDir, join(repoPath, '.git'), reviewsDir],
      denyRead: [...SECRET_DIRS.map((dir) => `~/${dir}`), join(rootDir, '.env')],
    },
    network: { allowedDomains: gitHost ? [gitHost] : [] },
  };
}

export function claudeSettings({ sandbox = true, ...paths }) {
  return {
    permissions: { deny: denyRules(paths) },
    ...(sandbox ? { sandbox: sandboxSettings(paths) } : {}),
  };
}
