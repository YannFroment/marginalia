import { GITLAB_USERNAME, encodedProjectId } from './config.mjs';
import { gitlabRequest, lastPushAt, listRawDiscussions } from './gitlab.mjs';
import { listDraftNotes } from './gitlab-drafts.mjs';
import { computeReviewState } from './review-state.mjs';

// Reads where an MR really stands for me from GitLab (see review-state.mjs). One MR is five
// calls; a failure of the optional ones (reviewers, approvals, pushes, drafts) only makes
// the picture a little poorer, while without the discussions there is no picture at all.
const path = (iid) => `/projects/${encodedProjectId}/merge_requests/${iid}`;
const orElse = (promise, fallback) => promise.catch(() => fallback);

// `mr` is a GitLab MR, or a status entry: all that is read is its iid and its author.
export async function fetchReviewState(mr) {
  const author = mr.author?.username ?? mr.author ?? null;
  const [discussions, reviewers, approvals, pushedAt, drafts] = await Promise.all([
    listRawDiscussions(mr.iid),
    orElse(gitlabRequest(`${path(mr.iid)}/reviewers`), []),
    orElse(gitlabRequest(`${path(mr.iid)}/approvals`), null),
    orElse(lastPushAt({ iid: mr.iid }), null),
    orElse(listDraftNotes(mr.iid), []),
  ]);
  return computeReviewState({
    me: GITLAB_USERNAME,
    author,
    discussions,
    reviewers,
    approvedBy: (approvals?.approved_by ?? []).map((a) => a.user?.username),
    lastPushAt: pushedAt,
    drafts: drafts.length,
  });
}

// iid -> state, or null for an MR that could not be read. A few at a time: it is many calls.
export async function fetchReviewStates(mrs, limit = 4) {
  const states = new Map();
  const queue = [...mrs];
  const worker = async () => {
    for (let mr = queue.shift(); mr; mr = queue.shift()) {
      try {
        states.set(mr.iid, await fetchReviewState(mr));
      } catch (err) {
        console.warn(`Could not read where !${mr.iid} stands: ${String(err.message).slice(0, 120)}`);
        states.set(mr.iid, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  return states;
}
