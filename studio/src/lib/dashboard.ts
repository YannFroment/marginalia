import type { MyState, ReviewItem } from './api';

// Home groups every review by whose turn it is, so what waits on you is the first thing you
// see. The turn comes from where the MR really stands in GitLab (what you wrote, decided,
// and who pushed or answered since), never from what this browser has opened. Pure, and kept
// to erasable TypeScript so a node test can load it.

export type GroupId = 'first' | 'returned' | 'unsent' | 'mine' | 'waiting' | 'done';

export interface Group {
  id: GroupId;
  title: string;
  hint: string;
  // The review is waiting on you (as opposed to on someone else, or on nobody).
  needsYou: boolean;
  collapsed: boolean;
  items: ReviewItem[];
}

const GROUPS: Omit<Group, 'items'>[] = [
  { id: 'first', title: 'Needs your first review', hint: 'You have not reviewed it on GitLab yet.', needsYou: true, collapsed: false },
  { id: 'returned', title: 'Returned to you', hint: 'The author pushed or answered since your review.', needsYou: true, collapsed: false },
  { id: 'unsent', title: 'Review to send', hint: 'Your comments wait in a pending review on GitLab.', needsYou: true, collapsed: false },
  { id: 'mine', title: 'Comments on your merge requests', hint: 'Reviewers wrote on your work.', needsYou: true, collapsed: false },
  { id: 'waiting', title: 'Waiting on others', hint: 'You did your part. The next move is theirs.', needsYou: false, collapsed: false },
  { id: 'done', title: 'Done', hint: 'Nothing left for you here.', needsYou: false, collapsed: true },
];

const at = (iso: string | null) => (iso === null ? null : Date.parse(iso));
const latest = (...times: (string | null)[]) => times.map(at).filter((t): t is number => t !== null).reduce<number | null>((a, b) => (a === null || b > a ? b : a), null);
const after = (a: number | null, b: number | null) => a !== null && b !== null && a > b;

function turnOf(kind: ReviewItem['kind'], s: MyState): GroupId {
  if (kind === 'comments') {
    // My own MR: reviewers wrote after my last push or answer, and threads are still open.
    const mine = latest(s.myActivityAt, s.lastPushAt);
    if (s.unresolved > 0 && (mine === null || after(at(s.peerActivityAt), mine))) return 'mine';
    return s.unresolved > 0 || s.peerActivityAt === null ? 'waiting' : 'done';
  }
  if (!s.reviewed) return s.drafts > 0 ? 'unsent' : 'first';
  // I reviewed; they pushed or answered after me: it is back with me.
  if (after(latest(s.lastPushAt, s.authorActivityAt), at(s.myActivityAt))) return 'returned';
  if (s.drafts > 0) return 'unsent';
  return s.decision === 'approved' ? 'done' : 'waiting';
}

// The group of one review, or null when Home does not list it (retros).
export function groupOf(item: ReviewItem): GroupId | null {
  if (item.kind === 'retro') return null;
  // A merge request that is no longer open needs nobody; neither does one not read yet.
  if (!item.tracked || !item.myState) return 'done';
  return turnOf(item.kind, item.myState);
}

// The non-empty groups in display order, each keeping the order the reviews came in.
export function groupReviews(items: ReviewItem[]): Group[] {
  const groups: Group[] = GROUPS.map((g) => ({ ...g, items: [] }));
  for (const item of items) {
    const id = groupOf(item);
    groups.find((g) => g.id === id)?.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

export interface Standing {
  label: string;
  tone: 'success' | 'warning' | 'info' | 'neutral';
}

// Where I stand on the MR, in words: what I decided, what waits to be sent, or that a review is asked
// of me. Shared by the list rows and the sidebar so both say the same thing.
export function standingOf(kind: ReviewItem['kind'], s: MyState): Standing | null {
  if (kind === 'comments') return s.unresolved > 0 ? { label: `${s.unresolved} open`, tone: 'warning' } : null;
  if (s.decision === 'approved') return { label: 'You approved', tone: 'success' };
  if (s.decision === 'changes_requested') return { label: 'You requested changes', tone: 'warning' };
  if (s.drafts > 0) return { label: `${s.drafts} to send`, tone: 'info' };
  if (s.reviewed) return { label: 'You commented', tone: 'neutral' };
  return s.requested ? { label: 'Review requested', tone: 'info' } : null;
}

export const waitingOnYou = (groups: Group[]) => groups.filter((g) => g.needsYou).reduce((n, g) => n + g.items.length, 0);
