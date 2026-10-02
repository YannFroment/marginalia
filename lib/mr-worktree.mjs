import { basename, join } from 'node:path';
import { execFileAsync } from './exec.mjs';
import { REPO_LOCAL_PATH, MR_WORKTREES_DIR, MR_WORKTREE_CREATE, MR_WORKTREE_REMOVE } from './config.mjs';
import { fileExists } from './paths.mjs';

// One worktree per MR (MR_WORKTREES_DIR set): an MR whose branch is already
// checked out somewhere (your own dev worktree) is worked on right there; any
// other MR gets a worktree of its own, named review-<iid>, created on first use
// and removed once the MR is merged or closed. The bot owns that folder only
// while it is detached: one you put on the MR branch yourself is yours.
export const perMrWorktrees = Boolean(MR_WORKTREES_DIR);

const REPO = basename(REPO_LOCAL_PATH ?? '');
export const ownedName = (iid) => `review-${iid}`;
export const ownedPath = (iid) => join(MR_WORKTREES_DIR, ownedName(iid), REPO);

const fill = (template, mr) => template
  .replaceAll('{name}', ownedName(mr.iid))
  .replaceAll('{iid}', String(mr.iid))
  .replaceAll('{repo}', REPO)
  .replaceAll('{branch}', mr.source_branch ?? '');

async function shell(command) {
  await execFileAsync('bash', ['-lc', command], { cwd: REPO_LOCAL_PATH, maxBuffer: 1024 * 1024 * 20 });
}

export async function listWorktrees() {
  const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], { cwd: REPO_LOCAL_PATH });
  return stdout.split('\n\n').map((block) => ({
    path: block.match(/^worktree (.+)$/m)?.[1],
    branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1],
  })).filter((w) => w.path);
}

// The worktree already holding this MR, if any, from a listWorktrees() result.
export function existingWorktree(mr, worktrees) {
  const yours = worktrees.find((w) => w.branch === mr.source_branch);
  if (yours) return { path: yours.path, owned: false };
  const own = worktrees.find((w) => w.path === ownedPath(mr.iid));
  return own ? { path: own.path, owned: !own.branch } : null;
}

// Where to work on this MR: { path, owned }, created when missing.
export async function mrWorktree(mr) {
  const found = existingWorktree(mr, await listWorktrees());
  if (found) return found;
  const own = ownedPath(mr.iid);
  if (!(await fileExists(own))) {
    if (MR_WORKTREE_CREATE) await shell(fill(MR_WORKTREE_CREATE, mr));
    else await execFileAsync('git', ['worktree', 'add', '--detach', own], { cwd: REPO_LOCAL_PATH });
    if (!(await fileExists(own))) throw new Error(`MR_WORKTREE_CREATE did not create ${own}`);
  }
  return { path: own, owned: true };
}

// Brings a bot-owned worktree to the MR head. Ignored files (installed
// dependencies, git hooks) stay. Never called on your own worktree.
export async function syncOwned(path, mr) {
  await execFileAsync('git', ['fetch', '--quiet', 'origin', `merge-requests/${mr.iid}/head`], { cwd: path });
  await execFileAsync('git', ['checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD'], { cwd: path });
  await execFileAsync('git', ['clean', '-fd', '-e', '.claude'], { cwd: path });
  await execFileAsync('git', ['fetch', '--quiet', 'origin', `${mr.target_branch}:refs/remotes/origin/${mr.target_branch}`], { cwd: path });
}

// iids of the review-<iid> folders the bot owns, detached ones only.
export async function ownedIids() {
  if (!perMrWorktrees) return [];
  const worktrees = await listWorktrees();
  return worktrees
    .filter((w) => !w.branch)
    .map((w) => Number(w.path.match(/\/review-(\d+)\/[^/]+$/)?.[1]))
    .filter((iid) => iid && worktrees.some((w) => w.path === ownedPath(iid)));
}

// Shows the MR's changes as uncommitted changes in a bot-owned worktree: the
// head is moved back to where the MR branched off, files stay as they are.
// The next syncOwned() puts the worktree back on the MR's head.
export async function uncommitOwned(path, mr) {
  await syncOwned(path, mr);
  const { stdout } = await execFileAsync('git', ['merge-base', 'HEAD', `origin/${mr.target_branch}`], { cwd: path });
  await execFileAsync('git', ['reset', '--quiet', '--mixed', stdout.trim()], { cwd: path });
}

export async function removeOwned(mr) {
  if (!(await fileExists(ownedPath(mr.iid)))) return false;
  if (MR_WORKTREE_REMOVE) await shell(fill(MR_WORKTREE_REMOVE, mr));
  else await execFileAsync('git', ['worktree', 'remove', '--force', ownedPath(mr.iid)], { cwd: REPO_LOCAL_PATH });
  await execFileAsync('git', ['worktree', 'prune'], { cwd: REPO_LOCAL_PATH });
  return true;
}
