import { useCallback, useEffect, useState } from 'react';

// State mirrored in localStorage (JSON). It can be unavailable or throw, so
// every access is guarded and the UI works without it.
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          /* ignore */
        }
        return v;
      }),
    [key],
  );
  return [value, set] as const;
}

// The "working set": reviews opened as tabs. Opening one (any navigation to
// #/slug) adds it; tabs for reviews that no longer exist are dropped.
export function useOpenTabs(slug: string | null, known: Set<string> | null) {
  const [tabs, setTabs] = usePersistentState<string[]>('mr-review-viewer:tabs', []);

  useEffect(() => {
    if (slug && known?.has(slug)) setTabs((p) => (p.includes(slug) ? p : [...p, slug]));
  }, [slug, known, setTabs]);

  useEffect(() => {
    // An empty list is treated as a transient glitch (e.g. a directory read
    // failing), never as "every review is gone".
    if (!known || known.size === 0) return;
    setTabs((p) => {
      const kept = p.filter((s) => known.has(s));
      return kept.length === p.length ? p : kept;
    });
  }, [known, setTabs]);

  // Returns the tab to show next (the neighbour of the closed one), or null for Home.
  const close = useCallback(
    (s: string) => {
      const i = tabs.indexOf(s);
      const rest = tabs.filter((x) => x !== s);
      setTabs(rest);
      return rest[Math.min(i, rest.length - 1)] ?? null;
    },
    [tabs, setTabs],
  );

  return { tabs, close };
}
