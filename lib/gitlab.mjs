import { positionForLine } from './diff-position.mjs';
import { GITLAB_BASE_URL, GITLAB_TOKEN, GITLAB_USERNAME, STALE_AFTER_DAYS, encodedProjectId, excludedAuthors } from './config.mjs';
import { c, mrTag } from './log.mjs';
import { mtimeOrNull, reviewOutputPath } from './paths.mjs';

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

// GitLab names the users behind group and project access tokens
// group_<id>_bot_<hash> / project_<id>_bot_<hash> (review app links, CI notes):
// their notes are not reviewer feedback.
export function isBotAuthor(author) {
  return author?.bot === true || /^(group|project)_\d+_bot(_|$)/.test(author?.username ?? '');
}

// Most recent discussion note left by someone other than me (system notes, bot
// notes and my own replies don't count), across all discussions on the MR. Null if no
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
      if (isBotAuthor(note.author)) continue;
      const notedAt = new Date(note.updated_at).getTime();
      if (latest === null || notedAt > latest) latest = notedAt;
    }
  }
  return latest;
}

// General (non-inline) comment on an MR, as the owner of GITLAB_TOKEN. Only
// called from the studio's confirmed "Post to GitLab" action.
export async function postMergeRequestNote(iid, body) {
  return gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

// Inline comment anchored on a line of the MR diff (a one-note discussion, the
// same thing the "Add a comment" button on a diff line creates). GitLab refuses
// it (400) when the line isn't part of the diff, hence the caller's fallback.
// `line` is a line number of the new version of the file; without it the
// comment is attached to the whole file (GitLab 16.9+, else the caller falls back).
export async function postMergeRequestInlineNote(iid, body, path, line) {
  return gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/discussions`, {
    method: 'POST',
    body: JSON.stringify({ body, position: await inlinePosition(iid, path, line) }),
  });
}

// The diff position of path:line. An unchanged line shown as context needs its
// old line number too, else GitLab refuses the note; a renamed file needs its old path.
export async function inlinePosition(iid, path, line) {
  const mr = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}`);
  const refs = mr.diff_refs;
  if (!refs) throw new Error('merge request has no diff_refs yet');
  const files = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/diffs?per_page=100`);
  const file = files.find((f) => f.new_path === path);
  const lines = line && file ? positionForLine(file.diff, line) : null;
  return {
    position_type: line ? 'text' : 'file',
    base_sha: refs.base_sha,
    start_sha: refs.start_sha,
    head_sha: refs.head_sha,
    old_path: file?.old_path ?? path,
    new_path: path,
    ...(line ? lines ?? { new_line: line } : {}),
  };
}

// False only when GitLab says the note is gone (404, i.e. deleted); any other
// failure (network, 5xx, token) throws so the caller keeps what it has.
export async function mergeRequestNoteExists(iid, noteId) {
  try {
    await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/notes/${noteId}`);
    return true;
  } catch (err) {
    if (/ -> 404:/.test(String(err.message))) return false;
    throw err;
  }
}
