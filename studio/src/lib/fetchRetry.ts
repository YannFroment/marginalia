// A fetch of JSON that outlasts a server that is busy or just restarting: a network failure, a 5xx or a 429
// is tried again after a growing pause; an answer that says "no" (a 404, a 400) is final.

const PAUSES = [400, 800, 1600, 3200, 5000];

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const retryable = (e: unknown) => !(e instanceof HttpError) || e.status >= 500 || e.status === 429;

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(t);
    resolve();
  }, { once: true });
});

export async function fetchJson<T>(url: string, { retries = 4, signal }: { retries?: number; signal?: AbortSignal } = {}): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, { signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(res.status, (body as { error?: string }).error ?? `HTTP ${res.status}`);
      return body as T;
    } catch (e) {
      if (signal?.aborted || attempt >= retries || !retryable(e)) throw e;
      await pause(PAUSES[Math.min(attempt, PAUSES.length - 1)], signal);
    }
  }
}
