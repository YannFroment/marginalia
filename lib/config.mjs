import 'dotenv/config';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STATE_FILE = join(ROOT, 'state.json');
// Live status for the SwiftBar menu bar plugin (swiftbar/menubar.mjs).
export const STATUS_FILE = join(ROOT, 'status.json');
// Settings changed at runtime from the studio (see lib/settings.mjs).
export const SETTINGS_FILE = process.env.SETTINGS_FILE || join(ROOT, 'settings.json');
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
  // Opens a file of the MR at a line, from a comment's "Open in IDE" button.
  // {folder} is the MR's worktree, {file} the absolute file path, {line} the
  // line; arguments are split on spaces, no shell. Empty: no button.
  IDE_COMMAND = `${process.env.VSCODE_BIN || 'code'} {folder} --goto {file}:{line}`,
  // Opens the MR's worktree, from the review's "Show diff in IDE" button.
  IDE_FOLDER_COMMAND = `${process.env.VSCODE_BIN || 'code'} {folder}`,
  // The four below are only defaults: settings.json (the studio's Settings page) wins.
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
  // Runs are sandboxed by default (Bash confined to the worktree, no network but
  // the GitLab host, no secrets dirs). "false" turns the sandbox off; the
  // Read/Edit deny rules stay on either way.
  CLAUDE_SANDBOX = 'true',
  // Space-separated env var names that look like secrets but a command needs
  // (the run otherwise gets no *TOKEN*, *SECRET*, *PASSWORD*, *API_KEY* variable).
  CLAUDE_ENV_PASSTHROUGH = '',
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
  // Lets the studio push the fixes a triage committed (marginalia/<branch-slug>)
  // to your MR's branch, fast-forward only, after a confirmation. Off by default.
  ALLOW_PUSH = 'false',
  // "branch" (default): the bot checks out the MR's branch, and skips the MR
  // while that branch is checked out in another worktree. "detached": it checks
  // out the MR's head without any local branch, so a branch open in your own
  // worktree never blocks it and no local branch is ever moved.
  BOT_CHECKOUT = 'branch',
  // Optional: JIRA_BASE_URL alone links the ticket in the studio's side panel;
  // with all three set, the studio also lists reviews by the Jira priority of
  // the ticket named in the MR, most urgent first.
  JIRA_BASE_URL = '',
  JIRA_EMAIL = '',
  JIRA_API_TOKEN = '',
  // Command run by the studio's "Deep review" button on one MR, on demand
  // (empty: no button). Meant for the expensive checks the automatic pass skips.
  DEEPEN_COMMAND = '',
  // Command run by the studio's "Run QA" button: adversarial tests of the
  // running app (review app, browser). Its report becomes the review's QA section.
  QA_COMMAND = '',
  // One worktree per MR, under this folder (empty: the single shared bot
  // worktree). An MR whose branch is checked out somewhere is worked on there.
  MR_WORKTREES_DIR = '',
  // Optional commands to create and remove a bot-owned MR worktree, with
  // {name} (review-<iid>), {iid}, {repo} and {branch} filled in. Default:
  // git worktree add / remove.
  MR_WORKTREE_CREATE = '',
  MR_WORKTREE_REMOVE = '',
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

export const encodedProjectId = /^\d+$/.test(GITLAB_PROJECT_ID)
  ? GITLAB_PROJECT_ID
  : encodeURIComponent(GITLAB_PROJECT_ID);
export const REVIEWS_DIR = join(REPO_LOCAL_PATH ?? ROOT, '.claude', 'reviews');
