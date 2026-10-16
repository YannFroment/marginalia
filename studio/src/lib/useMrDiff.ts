import { useEffect, useState } from 'react';
import type { DiffFile } from './api';
import { fetchJson } from './fetchRetry';

// Which code the pane shows: the MR as it is now or as an earlier review saw it (`version` is that
// review's history id), whole ('full') or only what changed since that review ('since').
export type DiffScope = { version: string | null; mode: 'full' | 'since' };

export type DiffState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; files: DiffFile[]; approximate: boolean };

// The changed files of the MR behind a review, those of one tour stop. Idle without a slug (a
// review with no tracked MR); refetched when the stop or the review changes, and tried
// again by itself when the server is slow or restarting. What was loaded for another stop never shows
// under this one: it counts as loading at once.
export function useMrDiff(slug: string | null, stopId: string, refreshKey: string | undefined, scope: DiffScope = { version: null, mode: 'full' }): { state: DiffState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${slug}|${stopId}|${refreshKey}|${scope.version}|${scope.mode}|${attempt}`;
  const [result, setResult] = useState<{ key: string; state: DiffState } | null>(null);
  useEffect(() => {
    if (!slug) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({ stop: stopId, mode: scope.mode, ...(scope.version && { version: scope.version }) });
    fetchJson<{ files: DiffFile[]; approximate?: boolean }>(`/api/reviews/${encodeURIComponent(slug)}/diff?${query}`, { signal: controller.signal })
      .then((j) => setResult({ key, state: { status: 'ready', files: j.files, approximate: Boolean(j.approximate) } }))
      .catch((e: Error) => {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'error', message: e.message } });
      });
    return () => controller.abort();
  }, [slug, stopId, refreshKey, scope.version, scope.mode, attempt, key]);
  const state: DiffState = !slug ? { status: 'idle' } : result?.key === key ? result.state : { status: 'loading' };
  return { state, retry: () => setAttempt((n) => n + 1) };
}
