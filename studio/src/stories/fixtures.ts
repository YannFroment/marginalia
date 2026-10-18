import type { ReviewItem } from '../lib/api';

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const review: ReviewItem = {
  slug: 'mr-4821',
  kind: 'review',
  title: 'feat(booking): retry payment capture on transient gateway errors',
  iid: 4821,
  author: 'yfroment',
  webUrl: 'https://gitlab.example.com/group/project/-/merge_requests/4821',
  branch: 'feat/payment-retry',
  verdict: 'REQUEST_CHANGES',
  critical: 1,
  important: 2,
  reviewedAt: ago(2 * HOUR),
  tracked: true,
  summary: 'Adds a bounded retry around the capture call. The backoff is sound, but a retried capture is not idempotent on the gateway side and can double-charge.',
  highlights: [
    { severity: 'critical', text: 'Capture is retried without an idempotency key: a timeout after success charges twice.' },
    { severity: 'important', text: 'The retry budget is read from process env on every call.' },
  ],
  stackId: null,
  crossLayer: [],
  stale: false,
  postable: 2,
  contract: { source: 'markdown', warnings: [] },
  jira: { key: 'PAY-212', priority: 'High', rank: 2 },
  lastDeepAt: null,
  lastQaAt: null,
  resumeCommand: null,
};

export const approved: ReviewItem = { ...review, slug: 'mr-4790', iid: 4790, title: 'chore(deps): bump date-fns to 4.1', verdict: 'APPROVE', critical: 0, important: 0, highlights: [], summary: 'Patch-level bump, lockfile only.', jira: null, reviewedAt: ago(30 * HOUR) };
export const other: ReviewItem = { ...review, slug: 'mr-4755', iid: 4755, title: 'docs: explain the release process', verdict: 'OTHER', critical: 0, important: 1, highlights: [], jira: null };
