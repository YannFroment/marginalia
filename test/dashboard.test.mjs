import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, groupReviews, standingOf, waitingOnYou } from '../studio/src/lib/dashboard.ts';

const state = (over = {}) => ({
  requested: false, decision: null, reviewed: false, drafts: 0, myActivityAt: null, lastPushAt: null,
  authorActivityAt: null, peerActivityAt: null, unresolved: 0, computedAt: '2026-10-12T20:00:00Z', ...over,
});
const review = (slug, myState, over = {}) => ({ slug, kind: 'review', tracked: true, myState, ...over });
const DAY1 = '2026-10-09T10:00:00Z';
const DAY2 = '2026-10-10T10:00:00Z';

test('an MR I have not reviewed on GitLab needs my first review, whatever this browser has opened', () => {
  assert.equal(groupOf(review('a', state())), 'first');
  assert.equal(groupOf(review('a', state({ peerActivityAt: DAY2, unresolved: 3 }))), 'first', 'other people being active is not me reviewing');
});

test('after my review, a push or an answer by the author sends it back to me', () => {
  const mine = { reviewed: true, decision: 'changes_requested', myActivityAt: DAY1 };
  assert.equal(groupOf(review('a', state({ ...mine, lastPushAt: DAY2 }))), 'returned', 'pushed after me');
  assert.equal(groupOf(review('a', state({ ...mine, authorActivityAt: DAY2 }))), 'returned', 'answered after me');
  assert.equal(groupOf(review('a', state({ ...mine, lastPushAt: '2026-10-08T00:00:00Z' }))), 'waiting', 'the push came before my review');
  assert.equal(groupOf(review('a', state({ ...mine, peerActivityAt: DAY2 }))), 'waiting', 'another reviewer writing is not the author');
  assert.equal(groupOf(review('a', state({ reviewed: true, decision: 'approved', myActivityAt: DAY1, lastPushAt: DAY2 }))), 'returned', 'a push after my approval needs another look');
});

test('pending drafts, my approval and a plain comment each land where they belong', () => {
  assert.equal(groupOf(review('a', state({ drafts: 2 }))), 'unsent', 'drafts, no review sent yet');
  assert.equal(groupOf(review('a', state({ reviewed: true, myActivityAt: DAY1, drafts: 1 }))), 'unsent');
  assert.equal(groupOf(review('a', state({ reviewed: true, decision: 'approved', myActivityAt: DAY2 }))), 'done');
  assert.equal(groupOf(review('a', state({ reviewed: true, myActivityAt: DAY1 }))), 'waiting', 'I commented; the author has the ball');
});

test('on my own MR, reviewers writing after my push or answer is the turn that comes back to me', () => {
  const own = (o) => review('own', state(o), { kind: 'comments' });
  assert.equal(groupOf(own({ unresolved: 2, peerActivityAt: DAY2, lastPushAt: DAY1 })), 'mine');
  assert.equal(groupOf(own({ unresolved: 2, peerActivityAt: DAY1, lastPushAt: DAY2 })), 'waiting', 'I pushed since: they have to look');
  assert.equal(groupOf(own({ unresolved: 2, peerActivityAt: DAY1, myActivityAt: DAY2 })), 'waiting', 'I answered since');
  assert.equal(groupOf(own({ unresolved: 0, peerActivityAt: DAY1 })), 'done', 'every thread resolved');
  assert.equal(groupOf(own({})), 'waiting', 'no review on it yet');
});

test('a closed MR, one without a reading, and a retro are not waiting on me', () => {
  assert.equal(groupOf(review('a', state(), { tracked: false })), 'done');
  assert.equal(groupOf(review('a', null)), 'done', 'not read from GitLab yet');
  assert.equal(groupOf(review('a', state(), { kind: 'retro' })), null);
});

test('groups come in the order they need you, empty ones are left out, and the count adds up', () => {
  const items = [
    review('a-done', state({ reviewed: true, decision: 'approved', myActivityAt: DAY1 })), review('b-first', state()), review('c-first', state()),
    review('d-returned', state({ reviewed: true, myActivityAt: DAY1, lastPushAt: DAY2 })),
    review('e-mine', state({ unresolved: 1, peerActivityAt: DAY2 }), { kind: 'comments' }), review('f-retro', state(), { kind: 'retro' }),
  ];
  const groups = groupReviews(items);
  assert.deepEqual(groups.map((g) => [g.id, g.items.map((i) => i.slug)]), [
    ['first', ['b-first', 'c-first']], ['returned', ['d-returned']], ['mine', ['e-mine']], ['done', ['a-done']],
  ]);
  assert.equal(waitingOnYou(groups), 4);
  assert.equal(groups.at(-1).collapsed, true);
  assert.deepEqual(groupReviews([]), []);
});

test('where I stand is said the same way everywhere, in order of what matters most', () => {
  const stand = (o, kind = 'review') => standingOf(kind, state(o));
  assert.deepEqual(stand({ decision: 'approved', reviewed: true }), { label: 'You approved', tone: 'success' });
  assert.deepEqual(stand({ decision: 'changes_requested', reviewed: true, drafts: 1 }), { label: 'You requested changes', tone: 'warning' });
  assert.deepEqual(stand({ drafts: 2 }), { label: '2 to send', tone: 'info' });
  assert.deepEqual(stand({ reviewed: true }), { label: 'You commented', tone: 'neutral' });
  assert.deepEqual(stand({ requested: true }), { label: 'Review requested', tone: 'info' });
  assert.equal(stand({}), null, 'nothing to say about an MR I have no part in yet');
  assert.deepEqual(stand({ unresolved: 3 }, 'comments'), { label: '3 open', tone: 'warning' });
  assert.equal(stand({}, 'comments'), null);
});
