import { useEffect, useState } from 'react';
import { fetchThreads, type Thread } from './api';

// The MR's threads on lines of code, for the diff. Empty while loading or when they cannot be
// read: the diff is still worth showing without them. Read again when the review changes.
export function useThreads(slug: string | null, refreshKey: string | undefined): Thread[] {
  const [loaded, setLoaded] = useState<{ key: string; threads: Thread[] } | null>(null);
  const key = `${slug}|${refreshKey}`;
  useEffect(() => {
    if (!slug) return undefined;
    let live = true;
    fetchThreads(slug).then((threads) => live && setLoaded({ key, threads }), () => live && setLoaded({ key, threads: [] }));
    return () => { live = false; };
  }, [slug, key]);
  return loaded?.key === key ? loaded.threads : [];
}
