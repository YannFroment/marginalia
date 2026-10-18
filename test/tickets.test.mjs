import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.TICKET_MR_PROJECTS = 'group/web=web,group/api=api';
const { isTakeable, rankOf, changesSince, isStale } = await import('../lib/tickets-rank.mjs');
const { obviousClass } = await import('../lib/tickets-classify.mjs');

const ticket = (over = {}) => ({
  assignee: null,
  status: { name: 'Selected for Development', category: 'new' },
  priority: { id: '2', name: 'High' },
  mrs: [],
  ...over,
});
const issue = (summary, labels = []) => ({ fields: { summary, labels } });

test('a ticket is takeable when nobody has it and nothing blocks it', () => {
  assert.equal(isTakeable(ticket()), true);
  assert.equal(isTakeable(ticket({ assignee: { name: 'Ana', me: false } })), false);
  assert.equal(isTakeable(ticket({ status: { name: 'In Dev', category: 'indeterminate' } })), false);
  assert.equal(isTakeable(ticket({ status: { name: 'To Specify', category: 'new' } })), false);
  assert.equal(isTakeable(ticket({ status: { name: 'Blocked', category: 'new' } })), false);
});

test('priority comes first, then how ready the status is', () => {
  const ranks = new Map([['1', 0], ['2', 1]]);
  const highestBacklog = rankOf(ticket({ priority: { id: '1' }, status: { name: 'Backlog', category: 'new' } }), ranks);
  const highSelected = rankOf(ticket(), ranks);
  const highBacklog = rankOf(ticket({ status: { name: 'Backlog', category: 'new' } }), ranks);
  assert.ok(highestBacklog < highSelected);
  assert.ok(highSelected < highBacklog);
  assert.ok(rankOf(ticket({ priority: null }), ranks) > highBacklog);
});

test('the changes since the last refresh are named', () => {
  assert.deepEqual(changesSince(undefined, ticket()), ['new']);
  const before = ticket({ status: { name: 'Backlog', category: 'new' } });
  const after = ticket({ assignee: { name: 'Ana' }, mrs: [{}] });
  assert.deepEqual(changesSince(before, after), ['status: Backlog > Selected for Development', 'assignee: Ana', 'MRs: 1']);
});

test('a title prefix decides before labels and linked MRs', () => {
  assert.deepEqual(obviousClass(issue('[BE] Cache search results', ['frontend']), []), { front: false, reason: 'title prefix', by: 'rule' });
  assert.equal(obviousClass(issue('[Front] Crop images on upload'), []).front, true);
});

test('labels decide when there is no prefix', () => {
  assert.equal(obviousClass(issue('Cache search results', ['backend']), []).front, false);
  assert.equal(obviousClass(issue('Cache search results', ['FE']), []).front, true);
});

test('only an MR of the first project that names the ticket in its title or branch counts', () => {
  const web = { project: 'group/web', direct: true };
  assert.equal(obviousClass(issue('Keyboard navigation'), [web]).front, true);
  assert.equal(obviousClass(issue('Keyboard navigation'), [{ ...web, direct: false }]), null);
  assert.equal(obviousClass(issue('Keyboard navigation'), [{ project: 'group/api', direct: true }]), null);
});

test('a ticket untouched for six months, or titled outdated, is stale', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  assert.equal(isStale({ summary: 'Fix the cart', updated: '2026-09-01T00:00:00Z' }, now), false);
  assert.equal(isStale({ summary: 'Fix the cart', updated: '2026-03-01T00:00:00Z' }, now), true);
  assert.equal(isStale({ summary: '⚠️ OUTDATED ! Date picker', updated: '2026-10-01T00:00:00Z' }, now), true);
});
