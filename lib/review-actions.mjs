// What "Submit review" can do once the pending comments are published. Pure,
// so it is unit-tested without GitLab.
//
//   comment          publish the review as is
//   approve          publish, then approve the MR
//   request_changes  publish with GitLab's "requested changes" reviewer state
export const REVIEW_ACTIONS = ['comment', 'approve', 'request_changes'];

// Absent means "comment", the behaviour before the choice existed. Anything
// else that is not an action is refused (null), never guessed.
export function parseReviewAction(value) {
  if (value === undefined || value === null) return 'comment';
  return REVIEW_ACTIONS.includes(value) ? value : null;
}

// The `reviewer_state` of draft_notes/bulk_publish, if the action sets one.
export function reviewerStateFor(action) {
  return action === 'request_changes' ? 'requested_changes' : undefined;
}
