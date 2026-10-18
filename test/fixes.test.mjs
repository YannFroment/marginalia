// A triage's local fixes against the MR branch on origin, on real git repositories:
// a bare origin, and a clone standing for REPO_LOCAL_PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'marginalia-fixes-'));
const origin = join(root, 'origin.git');
const repo = join(root, 'repo');
const other = join(root, 'other');
process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.REPO_LOCAL_PATH = repo;

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
git(root, 'init', '--quiet', '--bare', '-b', 'main', origin);
git(root, 'clone', '--quiet', origin, repo);
git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'base');
git(repo, 'push', '--quiet', 'origin', 'HEAD:refs/heads/feat/x');
git(root, 'clone', '--quiet', '-b', 'feat/x', origin, other);

const { fixesStatus, pushFixes } = await import('../lib/fixes.mjs');
const mr = { iid: 7, source_branch: 'feat/x' };
const fix = (msg) => {
  git(repo, 'commit', '--quiet', '--allow-empty', '-m', msg);
  git(repo, 'update-ref', 'refs/heads/marginalia/feat-x', 'HEAD');
};

test('no fixes ref: nothing to push', async () => {
  assert.equal((await fixesStatus(mr)).state, 'none');
});

test('fixes on top of the MR head are ready, listed, then pushed fast-forward', async () => {
  fix('fix: one');
  const s = await fixesStatus(mr);
  assert.equal(s.state, 'ready');
  assert.deepEqual(s.commits.map((c) => c.subject), ['fix: one']);
  const { pushed, status } = await pushFixes(mr);
  assert.equal(pushed, true);
  assert.equal(status.state, 'pushed');
  assert.equal(git(repo, 'ls-remote', 'origin', 'refs/heads/feat/x').split(/\s/)[0], s.fixesSha);
});

test('fixes made before the MR branch moved are outdated and never pushed', async () => {
  fix('fix: two');
  git(other, 'pull', '--quiet', '--ff-only');
  git(other, 'commit', '--quiet', '--allow-empty', '-m', 'someone else');
  git(other, 'push', '--quiet', 'origin', 'feat/x');
  const remote = git(other, 'rev-parse', 'HEAD');
  assert.equal((await fixesStatus(mr)).state, 'outdated');
  const { pushed } = await pushFixes(mr);
  assert.equal(pushed, false);
  assert.equal(git(repo, 'ls-remote', 'origin', 'refs/heads/feat/x').split(/\s/)[0], remote);
});
