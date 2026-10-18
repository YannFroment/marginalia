import { execFileAsync } from './exec.mjs';
import { BOT_WORKTREE_DIR, REPO_LOCAL_PATH } from './config.mjs';
import { log, warn } from './log.mjs';
import { branchSlug, fixesRef } from './paths.mjs';

const git = (args) => execFileAsync('git', args, { cwd: REPO_LOCAL_PATH }).then(({ stdout }) => stdout.trim());
const succeeds = (args) => git(args).then(() => true, () => false);

// Where the MR's branch is on origin right now, without touching any local ref.
export async function remoteHead(branch) {
  const line = await git(['ls-remote', 'origin', `refs/heads/${branch}`]);
  return line.split(/\s/)[0] || null;
}

// Where the triage fixes of an MR stand against its branch on origin:
//   none      no fixes ref (the triage changed nothing)
//   ready     the fixes sit on top of the current MR head: a plain push fast-forwards it
//   pushed    the MR branch already contains them
//   outdated  the MR branch moved since the triage: the fixes no longer apply on top of it
// `mr` needs { iid, source_branch }.
export async function fixesStatus(mr) {
  const ref = fixesRef(mr);
  const fixesSha = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`]).catch(() => null);
  if (!fixesSha) return { ref, branch: mr.source_branch, state: 'none', fixesSha: null, remoteSha: null, commits: [] };
  const remoteSha = await remoteHead(mr.source_branch);
  const base = { ref, branch: mr.source_branch, fixesSha, remoteSha, commits: [] };
  if (!remoteSha) return { ...base, state: 'outdated' };
  // The remote head may be commits pushed since the triage that this repo hasn't fetched yet.
  if (!(await succeeds(['cat-file', '-e', `${remoteSha}^{commit}`]))) {
    await git(['fetch', '--quiet', 'origin', `+refs/heads/${mr.source_branch}:refs/marginalia/remote/${mr.iid}`]).catch(() => null);
  }
  if (remoteSha === fixesSha || (await succeeds(['merge-base', '--is-ancestor', fixesSha, remoteSha]))) return { ...base, state: 'pushed' };
  if (!(await succeeds(['merge-base', '--is-ancestor', remoteSha, fixesSha]))) return { ...base, state: 'outdated' };
  const log = await git(['log', '--format=%H%x00%s', `${remoteSha}..${fixesSha}`]);
  const commits = log.split('\n').filter(Boolean).map((l) => {
    const [sha, subject] = l.split('\0');
    return { sha, subject };
  });
  return { ...base, state: 'ready', commits };
}

// Pushes the fixes to the MR branch, fast-forward only: checked here first for a clear
// answer, and enforced by git itself (no --force) if the branch moves in between.
export async function pushFixes(mr) {
  const before = await fixesStatus(mr);
  if (before.state !== 'ready') return { pushed: false, status: before };
  await git(['push', '--quiet', 'origin', `${before.fixesSha}:refs/heads/${mr.source_branch}`]);
  return { pushed: true, status: await fixesStatus(mr) };
}

// Points marginalia/<slug> at the triage's fixes, for the studio to push. A triage
// that changed nothing supersedes the fixes of an earlier one: they were made on an
// older head, so the old ref is moved aside (recoverable) rather than left to push.
// Then checks the MR didn't move while the run was going: fixes made on top of an
// old head can't be pushed as they are.
export async function recordFixes(mr, baseSha, cwd = BOT_WORKTREE_DIR) {
  const ref = `refs/heads/${fixesRef(mr)}`;
  const { stdout: headSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd });
  if (headSha.trim() !== baseSha) {
    await execFileAsync('git', ['update-ref', ref, 'HEAD'], { cwd });
    log(mr, `Fixes committed locally (not pushed): push them from the studio, or git log ${fixesRef(mr)}`);
  } else {
    const { stdout: old } = await execFileAsync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd }).catch(() => ({ stdout: '' }));
    if (old.trim()) {
      await execFileAsync('git', ['update-ref', `refs/marginalia/superseded/${branchSlug(mr.source_branch)}`, old.trim()], { cwd });
      await execFileAsync('git', ['update-ref', '-d', ref], { cwd });
      log(mr, `No new fix: the previous triage's fixes are superseded (kept in refs/marginalia/superseded/${branchSlug(mr.source_branch)}).`);
    }
    return;
  }
  try {
    const remote = await remoteHead(mr.source_branch);
    if (remote !== baseSha) warn(mr, `The MR branch moved during the triage (${baseSha.slice(0, 8)} -> ${remote?.slice(0, 8) ?? 'deleted'}): its fixes no longer apply on top of it. Re-run the triage.`);
  } catch (err) {
    warn(mr, `Could not check whether the MR branch moved during the triage: ${err.message}`);
  }
}
