import { isBotAuthor } from './gitlab-notes.mjs';

// Where an MR really stands for me, from what GitLab holds: my notes, my approval or
// request for changes, my pending drafts, who pushed or replied since. Pure: the inputs
// are GitLab's answers, so it is tested on plain fixtures. What these facts mean for the
// dashboard (whose turn it is) is decided where they are shown.
//
//   requested        I am a requested reviewer of the MR
//   decision         'approved' | 'changes_requested' | null: my current verdict on it
//   reviewed         I did something on it: a note, a decision, a reviewer state
//   drafts           my comments waiting in a pending review, not sent yet
//   myActivityAt     my latest note or decision
//   lastPushAt       the latest push to the MR
//   authorActivityAt the latest note by the MR's author
//   peerActivityAt   the latest note by anyone but me (bots and system notes aside)
//   unresolved       threads still open

// My decision shows in the MR's system notes ("requested changes", "approved this merge request").
const DECISIONS = [
  [/^approved this merge request/i, 'approved'],
  [/^requested changes/i, 'changes_requested'],
  [/^unapproved this merge request/i, null],
];
const REVIEWER_STATES = { approved: 'approved', requested_changes: 'changes_requested' };

const newest = (times) => times.filter((t) => Number.isFinite(t)).reduce((a, b) => Math.max(a, b), -Infinity);
const iso = (ms) => (Number.isFinite(ms) && ms > -Infinity ? new Date(ms).toISOString() : null);

export function computeReviewState({ me, author, discussions, reviewers = [], approvedBy = [], lastPushAt = null, drafts = 0, now = Date.now() }) {
  const notes = discussions.flatMap((d) => d.notes ?? []);
  const time = (n) => Date.parse(n.created_at);
  const mine = notes.filter((n) => n.author?.username === me);
  const decisions = mine
    .filter((n) => n.system)
    .map((n) => ({ at: time(n), decision: DECISIONS.find(([re]) => re.test(n.body ?? '')) }))
    .filter((d) => d.decision)
    .sort((a, b) => a.at - b.at);
  const mineHuman = mine.filter((n) => !n.system);
  const reviewer = reviewers.find((r) => r.user?.username === me);

  // The reviewer entry is GitLab's own record when I was asked to review; otherwise the notes say.
  const fromNotes = decisions.at(-1)?.decision[1] ?? null;
  const decision = approvedBy.includes(me) ? 'approved' : reviewer ? (REVIEWER_STATES[reviewer.state] ?? fromNotes) : fromNotes;
  const reviewerActed = reviewer && ['reviewed', 'approved', 'requested_changes'].includes(reviewer.state);

  const others = notes.filter((n) => !n.system && n.author?.username !== me && !isBotAuthor(n.author));
  const unresolved = discussions.filter((d) => {
    const first = (d.notes ?? []).find((n) => !n.system);
    return first?.resolvable && !first.resolved;
  }).length;

  return {
    requested: Boolean(reviewer),
    decision,
    reviewed: mineHuman.length > 0 || decisions.length > 0 || decision !== null || Boolean(reviewerActed),
    drafts,
    myActivityAt: iso(newest([...mineHuman.map(time), ...decisions.map((d) => d.at)])),
    lastPushAt: iso(lastPushAt),
    authorActivityAt: iso(newest(others.filter((n) => n.author?.username === author).map(time))),
    peerActivityAt: iso(newest(others.map(time))),
    unresolved,
    computedAt: new Date(now).toISOString(),
  };
}
