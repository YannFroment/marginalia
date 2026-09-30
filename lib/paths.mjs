import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { REVIEWS_DIR } from './config.mjs';

export function branchSlug(branch) {
  return branch.replace(/\//g, '-');
}

export function reviewOutputPath(mr) {
  return join(REVIEWS_DIR, `${branchSlug(mr.source_branch)}.md`);
}

export const TRIAGE_FILE_PREFIX = 'mr-comments-';

export function mrCommentsOutputPath(mr) {
  return join(REVIEWS_DIR, `${TRIAGE_FILE_PREFIX}${branchSlug(mr.source_branch)}.md`);
}

// A local-only branch ref (never pushed) recording where /mr-comments' fixes
// for this MR ended up. The bot worktree shares its object database and refs
// with REPO_LOCAL_PATH (it's a `git worktree` of it), so this ref is
// immediately visible from your real checkout too — `git log
// marginalia/<slug>` or `git cherry-pick` from there — and survives the
// `git clean -fdx` + `reset --hard` the *next* checkoutMergeRequest() call
// does on the bot worktree's working copy, since that only touches the
// working tree and mr.source_branch, not this separate ref.
export function fixesRef(mr) {
  return `marginalia/${branchSlug(mr.source_branch)}`;
}

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function mtimeOrNull(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
