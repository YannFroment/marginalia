import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.MR_WORKTREES_DIR = '/work/tickets';
process.env.REPO_LOCAL_PATH = '/work/webapp';
const { existingWorktree, ownedPath } = await import('../lib/mr-worktree.mjs');

const mr = { iid: 42, source_branch: 'feat/x' };

test('your own worktree on the MR branch is the one used, and it is not the bot\'s', () => {
  const worktrees = [{ path: '/work/webapp', branch: 'develop' }, { path: '/work/tickets/X-1/webapp', branch: 'feat/x' }];
  assert.deepEqual(existingWorktree(mr, worktrees), { path: '/work/tickets/X-1/webapp', owned: false });
});

test('otherwise the bot uses its review-<iid> folder, once it exists', () => {
  assert.equal(ownedPath(42), '/work/tickets/review-42/webapp');
  assert.deepEqual(existingWorktree(mr, [{ path: '/work/tickets/review-42/webapp' }]), { path: '/work/tickets/review-42/webapp', owned: true });
  assert.equal(existingWorktree(mr, [{ path: '/work/webapp', branch: 'develop' }]), null);
});

test('a review-<iid> folder you put on a branch stays yours', () => {
  const worktrees = [{ path: '/work/tickets/review-42/webapp', branch: 'feat/x' }];
  assert.deepEqual(existingWorktree(mr, worktrees), { path: '/work/tickets/review-42/webapp', owned: false });
  assert.deepEqual(existingWorktree(mr, [{ path: '/work/tickets/review-42/webapp', branch: 'other' }]), { path: '/work/tickets/review-42/webapp', owned: false });
});
