import { GITLAB_BASE_URL, GITLAB_TOKEN, GITLAB_USERNAME, STALE_AFTER_DAYS, encodedProjectId, excludedAuthors } from './config.mjs';
import { c, mrTag } from './log.mjs';
import { mtimeOrNull, reviewOutputPath } from './paths.mjs';
import { positionForLine } from './diff-position.mjs';

export async function gitlabRequest(path, options = {}) {
  const res = await fetch(`${GITLAB_BASE_URL}/api/v4${path}`, {
    ...options,
    headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`GitLab API ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function listOpenMergeRequests() {
  const mrs = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests?state=opened&per_page=100&order_by=updated_at&sort=desc`);
  const staleCutoff = Date.now() - Number(STALE_AFTER_DAYS) * 24 * 60 * 60 * 1000;
  return mrs.filter((mr) => {
    if (mr.draft) return false;
    if (excludedAuthors.has(mr.author.username.toLowerCase())) return false;
    if (new Date(mr.updated_at).getTime() < staleCutoff) {
      console.log(`${c.dim}${mrTag(mr)} Skipping: no activity in the last ${STALE_AFTER_DAYS} days (last update ${mr.updated_at}).${c.reset}`);
      return false;
    }
    return true;
  });
}

// The MR list's updated_at also moves on comments, so the last push time comes
// from the diff versions (newest first).
export async function lastPushAt(mr) {
  const versions = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${mr.iid}/versions?per_page=1`);
  return versions.length ? new Date(versions[0].created_at).getTime() : null;
}

export async function reviewFileCoversLastPush(mr) {
  const mtime = await mtimeOrNull(reviewOutputPath(mr));
  if (mtime === null) return false;
  const pushedAt = await lastPushAt(mr);
  return pushedAt !== null && mtime >= pushedAt;
}

// Most recent discussion note left by someone other than me (system notes and
// my own replies don't count), across all discussions on the MR. Null if no
// peer has commented at all — used to detect "new reviewer feedback to triage"
// on MRs I authored, the same way lastPushAt() detects "new commits" for MRs
// I'm reviewing.
export async function latestPeerCommentAt(mr) {
  const discussions = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${mr.iid}/discussions?per_page=100`);
  let latest = null;
  for (const discussion of discussions) {
    for (const note of discussion.notes ?? []) {
      if (note.system) continue;
      if (note.author?.username === GITLAB_USERNAME) continue;
      const notedAt = new Date(note.updated_at).getTime();
      if (latest === null || notedAt > latest) latest = notedAt;
    }
  }
  return latest;
}

// Builds the GitLab position of an anchored comment against the MR's latest
// diff version. Throws when the file or the line isn't part of the diff, since
// GitLab would refuse the note anyway.
export async function diffPositionFor(iid, { path, line }) {
  const [latest] = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/versions?per_page=1`);
  if (!latest) throw new Error(`MR !${iid} has no diff version yet`);
  const files = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/diffs?per_page=100`);
  const file = files.find((f) => f.new_path === path);
  if (!file) throw new Error(`${path} is not changed in MR !${iid}`);
  const lines = positionForLine(file.diff, line);
  if (!lines) throw new Error(`${path}:${line} is outside the diff of MR !${iid}`);
  return {
    position_type: 'text',
    base_sha: latest.base_commit_sha,
    start_sha: latest.start_commit_sha,
    head_sha: latest.head_commit_sha,
    old_path: file.old_path,
    new_path: file.new_path,
    ...lines,
  };
}

// Comment anchored on a line of the diff, as the owner of GITLAB_TOKEN.
export async function postDiffDiscussion(iid, body, position) {
  return gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/discussions`, {
    method: 'POST',
    body: JSON.stringify({ body, position }),
  });
}

// General (non-inline) comment on an MR, as the owner of GITLAB_TOKEN. Only
// called from the studio's confirmed "Post to GitLab" action.
export async function postMergeRequestNote(iid, body) {
  return gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
