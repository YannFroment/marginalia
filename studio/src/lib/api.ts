import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from './fetchRetry';

export type Verdict = 'APPROVE' | 'REQUEST_CHANGES' | 'OTHER' | null;
type Kind = 'review' | 'comments' | 'retro';

// Where an MR really stands for me, read from GitLab (see lib/review-state.mjs).
export interface MyState {
  requested: boolean;
  decision: 'approved' | 'changes_requested' | null;
  reviewed: boolean;
  drafts: number;
  myActivityAt: string | null;
  lastPushAt: string | null;
  authorActivityAt: string | null;
  peerActivityAt: string | null;
  unresolved: number;
  computedAt: string;
}

export interface ReviewItem {
  slug: string;
  kind: Kind;
  title: string;
  iid: string | number | null;
  author: string | null;
  webUrl: string | null;
  branch: string | null;
  verdict: Verdict;
  myState?: MyState | null;
  risk?: RiskLevel | null;
  critical: number;
  important: number;
  reviewedAt: string;
  tracked: boolean;
  summary: string | null;
  highlights: { severity: 'critical' | 'important'; text: string }[];
  stackId: string | null;
  crossLayer: CrossFinding[];
  stale: boolean;
  // Findings with a ready-to-post comment, and how the bot read this review.
  postable: number;
  contract: { source: ShapeSource; warnings: string[] };
  jira: { key: string; priority: string | null; rank: number | null } | null;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Risk {
  level: RiskLevel;
  rationale: string | null;
  factors: string[];
}

// One stop of the guided read: a group of changes, what to check in it, and its findings.
// What the MR changed in plain words, before and after.
export interface Overview {
  before: string;
  after: string;
}

export interface TourStop {
  id: string;
  title: string;
  summary: string | null;
  files: string[];
  findingIds: string[];
  // Tests, database or generated files only: read last.
  supporting?: boolean;
}

// A changed file of the MR with its numbered diff lines (see lib/mr-diff.mjs).
export interface DiffLine {
  t: 'hunk' | 'add' | 'del' | 'ctx';
  old?: number | null;
  new?: number | null;
  text: string;
}

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: 'added' | 'deleted' | 'renamed' | 'modified';
  additions: number;
  deletions: number;
  omitted: boolean;
  lines: DiffLine[];
}

type ShapeSource = 'json' | 'markdown' | 'none';
type Severity = 'critical' | 'important' | 'suggestion' | 'info';

// One point of a review, the same whatever skill wrote it (see lib/findings.mjs).
export interface Finding {
  id: string; // stable across re-runs; also the commentId when it is posted
  severity: Severity;
  title: string;
  path: string | null;
  line: number | null;
  body: string;
  comment: string | null;
}

interface ReviewShape {
  source: ShapeSource;
  verdict: Verdict;
  summary: string | null;
  risk?: Risk | null;
  overview?: Overview | null;
  tour?: TourStop[];
  findings: Finding[];
  warnings: string[];
}

export interface CrossFinding {
  kind: 'settled-later' | 'belongs-lower' | 'assumes-upper';
  iid: number; // the layer concerned
  text: string;
}

export interface StackLayer {
  iid: number;
  title: string;
  webUrl: string | null;
  slug: string | null; // review file, which may not exist yet
  status: string;
  parentIid: number | null;
  position: number;
}

export interface Stack {
  id: string;
  baseBranch: string;
  layers: StackLayer[];
}

export interface BotStatus {
  pid: number;
  phase: 'idle' | 'polling' | 'reviewing' | 'error' | 'stopped';
  current: { iid: number; title: string; startedAt: string; progress?: string[] } | null;
  lastPoll: { at: string; ok: boolean; error: string | null } | null;
  nextPollAt: string | null;
  mrs?: { iid: number; status: string; reviewPath?: string | null }[];
}

export interface PostedInfo {
  at: string;
  iid: number;
  url: string;
  // 'draft': in GitLab's pending review until submitted. Absent on older records (published).
  state?: 'draft' | 'published';
  // false: GitLab refused the line anchor, so it went up as a general comment.
  inline?: boolean;
}

interface ReviewsPayload {
  status: BotStatus | null;
  items: ReviewItem[];
  stacks: Stack[];
  projectUrl: string | null;
  jiraBaseUrl: string | null;
  settings: Settings;
  settingsDefaults: Settings;
  allowPosting: boolean;
  allowPush: boolean;
  ticketsEnabled?: boolean;
  posted: Record<string, PostedInfo>;
}

// Reloads on every SSE "changed" event (fs.watch on the server). Until the first answer arrives it keeps
// trying: a server that is slow or restarting must not leave the page empty.
export function useReviews() {
  const [data, setData] = useState<ReviewsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<ReviewsPayload>('/api/reviews', { retries: loaded.current ? 0 : 6 }));
      loaded.current = true;
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, []);

  // Nothing yet and the last try failed: try again soon, the 30 s poll is too slow for a first load.
  useEffect(() => {
    if (!error || data) return undefined;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [error, data, load]);

  useEffect(() => {
    load();
    const es = new EventSource('/events');
    es.onmessage = () => load();
    const tick = setInterval(load, 30_000);
    return () => {
      es.close();
      clearInterval(tick);
    };
  }, [load]);

  return { data, error, reload: load };
}

export interface ReviewContent {
  markdown: string;
  shape: ReviewShape;
}

// The content of one review. What is shown always belongs to `slug`: it is never the previous review's while the
// next loads. A new version of the same review (`refreshKey`) is fetched quietly, the old one stays meanwhile.
export function useReview(slug: string | null, refreshKey: string | undefined) {
  const [result, setResult] = useState<{ slug: string; content: ReviewContent | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!slug) return undefined;
    const controller = new AbortController();
    fetchJson<{ markdown: string; shape: ReviewShape }>(`/api/reviews/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((j) => setResult({ slug, content: { markdown: j.markdown, shape: j.shape }, error: null }))
      .catch((e: Error) => {
        if (!controller.signal.aborted) setResult((prev) => ({ slug, content: prev?.slug === slug ? prev.content : null, error: e.message }));
      });
    return () => controller.abort();
  }, [slug, refreshKey, attempt]);
  const mine = result?.slug === slug ? result : null;
  return { content: mine?.content ?? null, error: mine?.content ? null : mine?.error ?? null, retry: () => setAttempt((n) => n + 1) };
}

// "Read" tracking: slug -> reviewedAt seen. localStorage may be unavailable.
const KEY = 'mr-review-viewer:seen';
export function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveSeen(seen: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* ignore */
  }
}

export interface Settings {
  pollIntervalMinutes: number;
  staleAfterDays: number;
  allowedTargetBranches: string[];
  excludeAuthors: string[];
}

// Only the keys to change; null puts a key back on its .env default. The bot applies it without a restart.
export async function saveSettings(patch: { [K in keyof Settings]?: Settings[K] | null }): Promise<{ settings: Settings; defaults: Settings }> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}


export async function postComment(slug: string, commentId: string, body: string, target?: { path: string; line?: number }): Promise<PostedInfo> {
  const res = await fetch('/api/post', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, commentId, body, ...target }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export type ReviewAction = 'comment' | 'approve' | 'request_changes';

export async function submitReview(slug: string, summary?: string, action: ReviewAction = 'comment'): Promise<{ submitted: number; summary: boolean; action: ReviewAction }> {
  const res = await fetch('/api/submit-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, summary, action }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export async function rerunReview(slug: string): Promise<void> {
  const res = await fetch('/api/rerun', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
}

export interface DraftNote {
  id: number;
  body: string;
  path: string | null;
  line: number | null;
}

export async function fetchDrafts(slug: string): Promise<DraftNote[]> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.drafts;
}

export async function updateDraft(slug: string, id: number, body: string): Promise<void> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(slug)}/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
}

export async function deleteDraft(slug: string, id: number): Promise<void> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(slug)}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
}

export interface ReviewVersion {
  id: string;
  at: string;
}

export async function fetchHistory(slug: string): Promise<ReviewVersion[]> {
  const res = await fetch(`/api/history/${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.versions;
}

export async function fetchHistoryVersion(slug: string, id: string): Promise<ReviewContent> {
  const res = await fetch(`/api/history/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return { markdown: j.markdown, shape: j.shape };
}

// Where a triage's local fixes stand against the MR branch on origin (lib/fixes.mjs).
export interface FixesStatus {
  ref: string;
  branch: string;
  state: 'none' | 'ready' | 'pushed' | 'outdated';
  fixesSha: string | null;
  remoteSha: string | null;
  commits: { sha: string; subject: string }[];
}

export async function fetchFixes(slug: string): Promise<FixesStatus> {
  const res = await fetch(`/api/fixes/${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export async function pushFixes(slug: string): Promise<FixesStatus> {
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

// A thread of the MR's GitLab conversation that sits on a line of code.
export interface ThreadNote {
  id: number;
  author: string | null;
  authorName: string | null;
  mine: boolean;
  body: string;
  at: string;
}

export interface Thread {
  id: string;
  resolved: boolean;
  resolvable: boolean;
  path: string;
  line: number | null;
  side: 'new' | 'old' | null;
  // Opened on an earlier version of the MR than its head: the line may have moved.
  outdated: boolean;
  notes: ThreadNote[];
}

export async function fetchThreads(slug: string): Promise<Thread[]> {
  const res = await fetch(`/api/reviews/${encodeURIComponent(slug)}/threads`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.threads;
}

export interface TicketMr {
  project: string;
  iid: number;
  title: string;
  state: 'opened' | 'merged' | 'closed' | 'locked';
  author: string | null;
  webUrl: string;
  mergedAt: string | null;
  direct: boolean;
}

export interface Ticket {
  key: string;
  url: string;
  project: string;
  type: string | null;
  summary: string;
  excerpt: string;
  status: { name: string; category: 'new' | 'indeterminate' | 'done' | null };
  priority: { id: string; name: string } | null;
  assignee: { name: string; me: boolean } | null;
  labels: string[];
  updated: string;
  mrs: TicketMr[];
  front: { front: boolean; reason: string; by: string } | null;
  mine: boolean;
  takeable: boolean;
  changes: string[];
  stale?: boolean;
}

export interface DoneEntry {
  at: string;
  key: string;
  from: string;
  to: string;
  done: boolean;
  reason?: string;
  proofs: { project: string; iid: number; sha: string; tag: string }[];
}

export interface Suggestion {
  id: string;
  at: string;
  area: string;
  sha: string;
  title: string;
  principle: string;
  files: string[];
  why: string;
  body: string;
  status: 'new' | 'posted';
  check?: { ok: boolean; problems: string[] };
  key?: string;
  url?: string;
}

export type SuggestionsPayload =
  | { enabled: false }
  | {
    enabled: true;
    canPost: boolean;
    project: string;
    running: boolean;
    lastRun: { at: string; area: string; sha?: string; costUsd?: number; found?: number; error?: string } | null;
    items: Suggestion[];
  };

export interface TicketsPayload {
  enabled: boolean;
  autoDone: boolean;
  data: { fetchedAt: string; projects: string[]; tickets: Ticket[] } | null;
  done: DoneEntry[];
  suggestions: SuggestionsPayload;
}

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
  return out;
}

export const runSuggestions = () => postJson('/api/suggestions/run', {});
export const dismissSuggestion = (id: string) => postJson('/api/suggestions/dismiss', { id });
export const postSuggestion = (id: string, title: string, body: string): Promise<{ key: string; url: string }> => postJson('/api/suggestions/post', { id, title, body });

export function useTickets(active: boolean) {
  const [data, setData] = useState<TicketsPayload | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) setData(await res.json());
    } catch {
      /* the reviews hook already reports an unreachable API */
    }
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    load();
    const es = new EventSource('/events');
    es.onmessage = () => load();
    return () => es.close();
  }, [active, load]);
  return data;
}
