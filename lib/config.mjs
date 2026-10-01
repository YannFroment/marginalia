import 'dotenv/config';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STATE_FILE = join(ROOT, 'state.json');
// Live status for the SwiftBar menu bar plugin (swiftbar/menubar.mjs).
export const STATUS_FILE = join(ROOT, 'status.json');
// Settings changed at runtime from the studio (see lib/settings.mjs).
export const SETTINGS_FILE = join(ROOT, 'settings.json');
// Comments posted to GitLab from the studio (lib/posted.mjs).
export const POSTED_FILE = join(ROOT, 'posted.json');

// core.hooksPath=.husky is shared with the real checkout, but `git clean -fdx`
// wipes the generated .husky/_/husky.sh from the bot worktree, so every hook
// (post-checkout on each MR checkout) would fail. Hooks are pointless here:
// disable them for every git call this process and its children (claude, and
// the nested worktrees it creates) make, without touching the repo's config.
{
  const n = Number(process.env.GIT_CONFIG_COUNT || 0);
  process.env[`GIT_CONFIG_KEY_${n}`] = 'core.hooksPath';
  process.env[`GIT_CONFIG_VALUE_${n}`] = '/dev/null';
  process.env.GIT_CONFIG_COUNT = String(n + 1);
}

// The /code-review command needs to orchestrate a nested worktree, spawn the
// code-reviewer agent, and read the ticket/MR from the GitLab and Atlassian
// connectors — it cannot run under the old read-only lockdown.
export const CLAUDE_ALLOWED_TOOLS = [
  'Agent',
  'EnterWorktree',
  'ExitWorktree',
  'Read',
  'Grep',
  'Glob',
  'Write',
  'Bash(git:*)',
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
export const CLAUDE_MR_COMMENTS_ALLOWED_TOOLS = [
  ...CLAUDE_ALLOWED_TOOLS,
  'Edit',
  'Skill',
  'mcp__GitLab__authenticate',
];

// The deep review runs checks (type check, tests), so it gets the shell.
export const CLAUDE_DEEPEN_ALLOWED_TOOLS = [...CLAUDE_ALLOWED_TOOLS, 'Bash', 'Skill'];

const extraTools = (process.env.CLAUDE_EXTRA_ALLOWED_TOOLS ?? '').split(/\s+/).filter(Boolean);
CLAUDE_ALLOWED_TOOLS.push(...extraTools);
CLAUDE_MR_COMMENTS_ALLOWED_TOOLS.push(...extraTools);
CLAUDE_DEEPEN_ALLOWED_TOOLS.push(...extraTools);

export const {
  GITLAB_BASE_URL: RAW_GITLAB_BASE_URL,
  GITLAB_TOKEN,
  GITLAB_PROJECT_ID, // numeric id, or "group/subgroup/project" path
  // Your own GitLab username. MRs authored by you are routed to
  // /mr-comments (triage reviewer comments) instead of /code-review.
  GITLAB_USERNAME,
  CLAUDE_BIN = 'claude',
  // Used to open a review file when its "ready" notification is clicked, and
  // by the SwiftBar menu's "Open review" entry.
  VSCODE_BIN = 'code',
  ALLOWED_TARGET_BRANCHES = '',
  EXCLUDE_AUTHORS = '',
  POLL_INTERVAL_MINUTES = '5',
  // MRs with no activity (push, comment, ...) in this many days are assumed
  // stale/abandoned and skipped, so we don't waste time reviewing something
  // that's likely out of date with develop already.
  STALE_AFTER_DAYS = '14',
  // Your real local checkout of the webapp repo: the one with .claude/commands,
  // .claude/agents, .claude/settings.json and the GitLab/Atlassian connectors
  // already authorized. .claude/ is gitignored, so it only exists here, never
  // in a fresh clone or worktree.
  REPO_LOCAL_PATH: RAW_REPO_LOCAL_PATH,
  // Legacy name of REPO_LOCAL_PATH, still read so existing .env files keep working.
  WEBAPP_LOCAL_PATH: LEGACY_REPO_LOCAL_PATH,
  // Slash commands the bot runs headless. Defaults match the original setup;
  // point them at your own. An empty TRIAGE_COMMAND disables the triage of your
  // own MRs (they are then ignored).
  REVIEW_COMMAND: RAW_REVIEW_COMMAND,
  TRIAGE_COMMAND: RAW_TRIAGE_COMMAND,
  // Space-separated tools added to the built-in allow-lists (e.g. your own MCP tools).
  CLAUDE_EXTRA_ALLOWED_TOOLS = '',
  // Free text appended to the output contract injected into every run.
  REVIEW_PROMPT_EXTRA = '',
  // A worktree of REPO_LOCAL_PATH dedicated to this bot, so reviewing MRs
  // never touches whatever branch you have checked out for your own work.
  // Created automatically on first run if missing.
  BOT_WORKTREE_DIR: RAW_BOT_WORKTREE_DIR,
  // macOS notifications when a review finishes/fails or a poll errors out.
  NOTIFICATIONS = 'true',
  // Port of the local review reader (studio/server.mjs), bound to 127.0.0.1.
  STUDIO_PORT = process.env.VIEWER_PORT ?? '4477', // VIEWER_PORT: legacy name
  // Lets the studio's "Post to GitLab" button post a comment on the MR (with
  // your GITLAB_TOKEN, so as you). Off by default: the studio is then read-only.
  ALLOW_POSTING = 'false',
  // Command run by the studio's "Deep review" button on one MR, on demand
  // (empty: no button). Meant for the expensive checks the automatic pass skips.
  DEEPEN_COMMAND = '',
} = process.env;

export const BOT_WORKTREE_DIR = RAW_BOT_WORKTREE_DIR || join(ROOT, 'worktree');
export const REPO_LOCAL_PATH = RAW_REPO_LOCAL_PATH || LEGACY_REPO_LOCAL_PATH;
export const GITLAB_BASE_URL = (RAW_GITLAB_BASE_URL ?? '').replace(/\/+$/, '');
export const REVIEW_COMMAND = RAW_REVIEW_COMMAND === undefined ? '/code-review' : RAW_REVIEW_COMMAND.trim();
export const TRIAGE_COMMAND = RAW_TRIAGE_COMMAND === undefined ? '/mr-comments' : RAW_TRIAGE_COMMAND.trim();

// Reported together so a fresh install sees everything to fix at once.
export function missingConfig() {
  const required = {
    GITLAB_BASE_URL,
    GITLAB_PROJECT_ID,
    GITLAB_TOKEN,
    GITLAB_USERNAME,
    REPO_LOCAL_PATH,
  };
  return Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
}
if (!process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK) {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(`Missing in .env: ${missing.join(', ')}. Run \`npm run init\` (interactive setup), or copy .env.example to .env and fill it in.`);
  }
}

export const allowedTargets = ALLOWED_TARGET_BRANCHES.split(',').map((s) => s.trim()).filter(Boolean);
export const excludedAuthors = new Set(EXCLUDE_AUTHORS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
export const encodedProjectId = /^\d+$/.test(GITLAB_PROJECT_ID)
  ? GITLAB_PROJECT_ID
  : encodeURIComponent(GITLAB_PROJECT_ID);
export const REVIEWS_DIR = join(REPO_LOCAL_PATH ?? ROOT, '.claude', 'reviews');
