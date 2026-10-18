import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchHistory, fetchHistoryVersion, type ReviewContent, type ReviewVersion } from './api';

// Earlier versions of a review, kept when a re-run replaces it. Viewing one is read-only;
// `versionId` is null while the latest is on screen.
export function useReviewVersions(slug: string | undefined, reviewedAt: string | undefined) {
  const [versions, setVersions] = useState<ReviewVersion[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [oldReview, setOldReview] = useState<ReviewContent | null>(null);
  useEffect(() => {
    setVersionId(null);
    setOldReview(null);
    if (!slug) return setVersions([]);
    let live = true;
    fetchHistory(slug).then((v) => live && setVersions(v), () => live && setVersions([]));
    return () => { live = false; };
  }, [slug, reviewedAt]);
  useEffect(() => {
    if (!slug || !versionId) return setOldReview(null);
    let live = true;
    fetchHistoryVersion(slug, versionId).then((r) => live && setOldReview(r), (e) => { toast.error('Could not load that version', { description: (e as Error).message }); if (live) setVersionId(null); });
    return () => { live = false; };
  }, [slug, versionId]);
  return { versions, versionId, setVersionId, oldReview };
}
