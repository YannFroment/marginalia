import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReviewState } from '../lib/review-state.mjs';

const note = (user, body, at, over = {}) => ({ id: Math.random(), body, system: false, created_at: at, author: { username: user }, ...over });
const sys = (user, body, at) => note(user, body, at, { system: true });
const thread = (...notes) => ({ id: `t${Math.random()}`, notes });
const base = { me: 'me', author: 'alice', discussions: [], now: Date.parse('2026-10-12T20:00:00Z') };

test('an MR I never touched is not reviewed, even with other people active on it', () => {
  const s = computeReviewState({ ...base, discussions: [thread(note('bob', 'looks off', '2026-10-10T10:00:00Z', { resolvable: true, resolved: false }))] });
  assert.deepEqual([s.reviewed, s.decision, s.requested, s.drafts, s.myActivityAt], [false, null, false, 0, null]);
  assert.equal(s.peerActivityAt, '2026-10-10T10:00:00.000Z');
  assert.equal(s.authorActivityAt, null, 'bob is not the author');
  assert.equal(s.unresolved, 1);
});

test('my notes and my decision are read from the MR itself', () => {
  const s = computeReviewState({
    ...base,
    lastPushAt: Date.parse('2026-10-12T16:00:00Z'),
    discussions: [
      thread(note('me', 'please cap it', '2026-10-09T09:00:00Z', { resolvable: true, resolved: false }), note('alice', 'done', '2026-10-12T17:00:00Z')),
      thread(sys('me', 'requested changes', '2026-10-09T09:05:00Z')),
      thread(sys('alice', 'added 1 commit', '2026-10-11T00:00:00Z')),
    ],
  });
  assert.deepEqual([s.reviewed, s.decision], [true, 'changes_requested']);
  assert.equal(s.myActivityAt, '2026-10-09T09:05:00.000Z', 'my latest note or decision');
  assert.equal(s.authorActivityAt, '2026-10-12T17:00:00.000Z', 'the author answered after me');
  assert.equal(s.lastPushAt, '2026-10-12T16:00:00.000Z');
});

test('the latest decision wins, and an approval is read from the approvals', () => {
  const flip = computeReviewState({ ...base, discussions: [thread(sys('me', 'requested changes', '2026-10-01T00:00:00Z')), thread(sys('me', 'approved this merge request', '2026-10-02T00:00:00Z'))] });
  assert.equal(flip.decision, 'approved');
  const withdrawn = computeReviewState({ ...base, discussions: [thread(sys('me', 'approved this merge request', '2026-10-01T00:00:00Z')), thread(sys('me', 'unapproved this merge request', '2026-10-02T00:00:00Z'))] });
  assert.equal(withdrawn.decision, null);
  assert.equal(computeReviewState({ ...base, approvedBy: ['someone', 'me'] }).decision, 'approved');
});

test('being a requested reviewer, and the state GitLab keeps for me, count', () => {
  const pending = computeReviewState({ ...base, reviewers: [{ user: { username: 'me' }, state: 'unreviewed' }] });
  assert.deepEqual([pending.requested, pending.reviewed], [true, false]);
  const marked = computeReviewState({ ...base, reviewers: [{ user: { username: 'me' }, state: 'reviewed' }] });
  assert.equal(marked.reviewed, true, 'marked as reviewed with no note');
  const changes = computeReviewState({ ...base, reviewers: [{ user: { username: 'me' }, state: 'requested_changes' }] });
  assert.equal(changes.decision, 'changes_requested');
});

test('drafts count, and bot or system notes are not people', () => {
  const s = computeReviewState({
    ...base, drafts: 2,
    discussions: [thread(note('project_5_bot_x', 'review app', '2026-10-12T10:00:00Z', { author: { username: 'project_5_bot_x', bot: true } }), sys('alice', 'changed the description', '2026-10-12T11:00:00Z'))],
  });
  assert.equal(s.drafts, 2);
  assert.equal(s.peerActivityAt, null);
  assert.equal(s.authorActivityAt, null);
});
