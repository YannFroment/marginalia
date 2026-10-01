import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { jiraKeyOf, byPriorityThenDate } = await import('../lib/jira.mjs');

test('ticket key from title, branch or description', () => {
  assert.equal(jiraKeyOf({ title: 'feat(ABC-971): font search', source_branch: 'x' }), 'ABC-971');
  assert.equal(jiraKeyOf({ title: 'Fix header', source_branch: 'feat/xyz-102-header' }), 'XYZ-102');
  assert.equal(jiraKeyOf({ title: 'Fix', source_branch: 'fix', description: 'Closes PROJ-1388' }), 'PROJ-1388');
  assert.equal(jiraKeyOf({ title: 'chore: pin node', source_branch: 'chore-pin', description: '' }), null);
});

test('most urgent first, unknown last, newest first on ties', () => {
  const items = [
    { slug: 'none-old', reviewedAt: '2026-09-01' },
    { slug: 'medium', jira: { rank: 2 }, reviewedAt: '2026-09-02' },
    { slug: 'high-old', jira: { rank: 1 }, reviewedAt: '2026-09-01' },
    { slug: 'high-new', jira: { rank: 1 }, reviewedAt: '2026-09-30' },
    { slug: 'none-new', jira: { rank: null }, reviewedAt: '2026-09-30' },
  ];
  assert.deepEqual(items.sort(byPriorityThenDate).map((i) => i.slug), ['high-new', 'high-old', 'medium', 'none-new', 'none-old']);
});
