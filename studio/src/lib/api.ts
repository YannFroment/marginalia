import { useCallback, useEffect, useState } from 'react';

export type Verdict = 'APPROVE' | 'REQUEST_CHANGES' | 'OTHER' | null;
export type Kind = 'review' | 'comments' | 'retro';

export interface ReviewItem {
  slug: string;
  kind: Kind;
  title: string;
  iid: string | number | null;
  author: string | null;
  webUrl: string | null;
  branch: string | null;
  verdict: Verdict;
  critical: number;
  important: number;
  reviewedAt: string;
  tracked: boolean;
  summary: string | null;
  highlights: { severity: 'critical' | 'important'; text: string }[];
  stackId: string | null;
  crossLayer: CrossFinding[];
  stale: boolean;
  resumeCommand: string | null;
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
  // false: GitLab refused the line anchor, so it went up as a general comment.
  inline?: boolean;
}

interface ReviewsPayload {
  status: BotStatus | null;
  items: ReviewItem[];
  stacks: Stack[];
  projectUrl: string | null;
  settings: { pollIntervalMinutes: number };
  allowPosting: boolean;
  posted: Record<string, PostedInfo>;
}

// Reloads on every SSE "changed" event (fs.watch on the server).
export function useReviews() {
  const [data, setData] = useState<ReviewsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, []);

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

export function useMarkdown(slug: string | null, refreshKey: string | undefined) {
  const [md, setMd] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/reviews/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => !cancelled && setMd(j.markdown))
      .catch(() => !cancelled && setMd(null));
    return () => {
      cancelled = true;
    };
  }, [slug, refreshKey]);
  return md;
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

export async function setPollInterval(minutes: number): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pollIntervalMinutes: minutes }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
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

export type ChatAsk = { id: string; tool: string; input: Record<string, unknown>; description: string | null; reason: string | null };

export type ChatEvent = {
  type: 'hello' | 'queued' | 'step' | 'answer' | 'error' | 'closed' | 'permission' | 'permission_answered';
  text?: string;
  costUsd?: number | null;
  pending: number;
  ask?: ChatAsk;
  asks?: ChatAsk[];
  id?: string;
};

// Sends one message to the bot about a review; answers arrive on chatEvents().
export async function sendChat(slug: string, message: string): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, message }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `HTTP ${res.status}`);
  }
}

// Allow or deny what the bot asked for, as the y/n of a terminal.
export async function answerChatPermission(slug: string, id: string, allow: boolean): Promise<void> {
  const res = await fetch('/api/chat/permission', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, id, allow }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `HTTP ${res.status}`);
  }
}

export function chatEvents(slug: string, onEvent: (event: ChatEvent) => void): () => void {
  const source = new EventSource(`/api/chat/stream?slug=${encodeURIComponent(slug)}`);
  source.onmessage = (e) => onEvent(JSON.parse(e.data));
  return () => source.close();
}
