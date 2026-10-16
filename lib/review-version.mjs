// Which version of the MR a review was written against, and which commits a diff of it spans.
// Pure: `versions` is GitLab's answer for /merge_requests/:iid/versions (newest first), so
// this is tested on plain fixtures.

// The version a review covered. A review keeps the head commit it was run on (`sha`); one
// written before that was recorded is matched by time instead: the newest version pushed
// before the review was written, which is `approximate`.
export function resolveReviewedVersion({ versions, sha, at }) {
  if (sha) return { sha, version: versions.find((v) => v.head_commit_sha === sha) ?? null, approximate: false };
  const version = Number.isFinite(at) ? versions.find((v) => Date.parse(v.created_at) <= at) ?? null : null;
  return { sha: version?.head_commit_sha ?? null, version, approximate: true };
}

// The two commits to compare for a mode: 'full' is the whole MR as that review saw it,
// 'since' is what changed from it to the MR's head now. `{ error }` when it cannot be told.
export function diffRange({ mode, reviewed, head }) {
  if (mode === 'since') {
    if (!reviewed.sha) return { error: 'This review was written before its version could be told.' };
    if (!head) return { error: 'The merge request has no versions on GitLab.' };
    return { from: reviewed.sha, to: head };
  }
  if (!reviewed.version) return { error: 'The version of the code this review covered is no longer on GitLab.' };
  return { from: reviewed.version.base_commit_sha, to: reviewed.version.head_commit_sha };
}
