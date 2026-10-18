import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewAction, reviewerStateFor } from '../lib/review-actions.mjs';

test('no action means a plain comment, as before the choice existed', () => {
  assert.equal(parseReviewAction(undefined), 'comment');
  assert.equal(parseReviewAction(null), 'comment');
});

test('the three actions are accepted and anything else is refused', () => {
  for (const a of ['comment', 'approve', 'request_changes']) assert.equal(parseReviewAction(a), a);
  for (const bad of ['', 'APPROVE', 'merge', 1, {}]) assert.equal(parseReviewAction(bad), null);
});

test('only requesting changes sets a reviewer state on publish', () => {
  assert.equal(reviewerStateFor('request_changes'), 'requested_changes');
  assert.equal(reviewerStateFor('approve'), undefined);
  assert.equal(reviewerStateFor('comment'), undefined);
});
