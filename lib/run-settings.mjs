import { ROOT, REPO_LOCAL_PATH, GITLAB_BASE_URL, BOT_WORKTREE_DIR, CLAUDE_SANDBOX, CLAUDE_ENV_PASSTHROUGH, REVIEWS_DIR } from './config.mjs';
import { claudeEnv } from './claude-cli.mjs';
import { claudeSettings } from './claude-sandbox.mjs';

// Sandbox + deny rules for every headless run (see claude-sandbox.mjs): the
// reviews, the triage and the studio's chat all get the same confinement.
// `worktreeDir`: the folder the run may write in, the MR's own when there is one per MR.
export const runSettings = (worktreeDir = BOT_WORKTREE_DIR) => claudeSettings({
  sandbox: CLAUDE_SANDBOX !== 'false',
  rootDir: ROOT,
  repoPath: REPO_LOCAL_PATH,
  worktreeDir,
  reviewsDir: REVIEWS_DIR,
  gitHost: new URL(GITLAB_BASE_URL).hostname,
});

// The environment of a headless run: secrets scrubbed (see claude-cli.mjs).
export const runEnv = () => claudeEnv(process.env, CLAUDE_ENV_PASSTHROUGH.split(/\s+/).filter(Boolean));
