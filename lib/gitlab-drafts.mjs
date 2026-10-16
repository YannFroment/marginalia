import { encodedProjectId } from './config.mjs';
import { gitlabRequest } from './gitlab.mjs';
import { diffPosition, isNotFound, toDraft } from './gitlab-notes.mjs';

// Comments from the studio go up as draft notes (GitLab's "Start a review"):
// private to the token's owner until publishDraftNotes() submits them all as
// one real review. They are per user and MR, so a bulk publish also sends any
// draft started in GitLab's own UI.

const mrPath = (iid) => `/projects/${encodedProjectId}/merge_requests/${iid}`;
const post = (iid, payload) => gitlabRequest(`${mrPath(iid)}/draft_notes`, { method: 'POST', body: JSON.stringify(payload) });

// General (non-inline) draft comment on an MR.
export async function createDraftNote(iid, body) {
  return post(iid, { note: body });
}

// Inline draft comment anchored on a line of the MR diff. GitLab refuses it
// (400) when the line isn't part of the diff, hence the caller's fallback.
// `line` is a line number of the new version of the file; without it the
// comment is attached to the whole file (GitLab 16.9+, else the caller falls back).
export async function createInlineDraftNote(iid, body, path, line) {
  return post(iid, { note: body, position: await inlinePosition(iid, path, line) });
}

// Submits every pending draft of the token's owner as one review. `reviewerState`
// ('requested_changes') also marks the review as requesting changes.
export async function publishDraftNotes(iid, reviewerState) {
  return gitlabRequest(`${mrPath(iid)}/draft_notes/bulk_publish`, {
    method: 'POST',
    ...(reviewerState ? { body: JSON.stringify({ reviewer_state: reviewerState }) } : {}),
  });
}

// The token owner's pending drafts on the MR, including ones started in GitLab's UI.
export async function listDraftNotes(iid) {
  const drafts = await gitlabRequest(`${mrPath(iid)}/draft_notes?per_page=100`);
  return drafts.map(toDraft);
}

export async function updateDraftNote(iid, draftId, body) {
  return gitlabRequest(`${mrPath(iid)}/draft_notes/${draftId}`, { method: 'PUT', body: JSON.stringify({ note: body }) });
}

export async function deleteDraftNote(iid, draftId) {
  return gitlabRequest(`${mrPath(iid)}/draft_notes/${draftId}`, { method: 'DELETE' });
}

export async function draftNoteExists(iid, draftId) {
  try {
    await gitlabRequest(`${mrPath(iid)}/draft_notes/${draftId}`);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

export async function inlinePosition(iid, path, line) {
  const mr = await gitlabRequest(mrPath(iid));
  if (!mr.diff_refs) throw new Error('merge request has no diff_refs yet');
  const files = await gitlabRequest(`${mrPath(iid)}/diffs?per_page=100`);
  return diffPosition(mr.diff_refs, files, path, line);
}
