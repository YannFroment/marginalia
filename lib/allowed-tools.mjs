import { CLAUDE_EXTRA_ALLOWED_TOOLS } from './config.mjs';

// The tools each headless run may use, passed to `claude --allowedTools`.

// Git subcommands, one rule each: a blanket `Bash(git:*)` would also allow
// `git -c alias.x='!sh ...'`, `git config` and friends, which run arbitrary code.
// These are what reading a diff and its history takes (plus the nested worktree
// the review command creates). A refused command fails the run with its name in
// the error: add it to CLAUDE_EXTRA_ALLOWED_TOOLS as `Bash(git <sub>:*)`.
const READ_GIT = [
  'diff', 'log', 'show', 'status', 'rev-parse', 'rev-list', 'merge-base', 'ls-files',
  'ls-tree', 'cat-file', 'blame', 'grep', 'show-ref', 'for-each-ref', 'symbolic-ref',
  'describe', 'name-rev', 'shortlog', 'diff-tree', 'fetch', 'remote get-url',
  'branch --show-current', 'branch --list', 'branch -a', 'branch -r',
  'worktree list', 'worktree add', 'worktree remove', 'worktree prune',
].map((sub) => `Bash(git ${sub}:*)`);

// The triage also commits its fixes locally (never pushed).
const WRITE_GIT = ['add', 'commit', 'checkout', 'switch', 'restore', 'stash'].map((sub) => `Bash(git ${sub}:*)`);

// The /code-review command needs to orchestrate a nested worktree, spawn the
// code-reviewer agent, and read the ticket/MR from the GitLab and Atlassian
// connectors — it cannot run under the old read-only lockdown.
const BASE_TOOLS = [
  'Agent',
  'EnterWorktree',
  'ExitWorktree',
  'Read',
  'Grep',
  'Glob',
  'Write',
  ...READ_GIT,
  'mcp__claude_ai_Gitlab__list_merge_requests',
  'mcp__claude_ai_Gitlab__get_merge_request',
  'mcp__claude_ai_Atlassian__getJiraIssue',
  'mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql',
];

// /mr-comments needs more than /code-review: it edits files directly instead
// of only reading/writing the report, and it calls preflight-access/humanizer
// (Skill) plus the self-hosted GitLab MCP server for discussion threads (the
// claude_ai_Gitlab connector doesn't expose those). The exact discussion-read
// tool name isn't documented anywhere in the command files — if a run fails
// on a missing tool, check the error for the tool name and add it here.
const MR_COMMENTS_TOOLS = [
  ...BASE_TOOLS,
  ...WRITE_GIT,
  'Edit',
  'Skill',
  'mcp__GitLab__authenticate',
];

// CLAUDE_EXTRA_ALLOWED_TOOLS (space-separated) is added to both lists.
const extraTools = CLAUDE_EXTRA_ALLOWED_TOOLS.split(/\s+/).filter(Boolean);
export const CLAUDE_ALLOWED_TOOLS = [...BASE_TOOLS, ...extraTools];
export const CLAUDE_MR_COMMENTS_ALLOWED_TOOLS = [...MR_COMMENTS_TOOLS, ...extraTools];

// The deep review runs checks (type check, tests), so it gets the shell; QA
// also drives a browser through the chrome-devtools MCP server.
export const CLAUDE_DEEPEN_ALLOWED_TOOLS = [...CLAUDE_ALLOWED_TOOLS, 'Bash', 'Skill'];
export const CLAUDE_QA_ALLOWED_TOOLS = [...CLAUDE_DEEPEN_ALLOWED_TOOLS, 'mcp__chrome-devtools'];
