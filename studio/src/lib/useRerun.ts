import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { rerunReview, type BotStatus, type ReviewItem } from './api';

// Re-running a review: `rerunning` is true from the click until the run has started and
// finished, so there is no gap between the request and the first "running" status where
// the buttons would come back. `live` is the bot's current run for this review, if any.
export function useRerun(item: ReviewItem | undefined, live: BotStatus['current']) {
  const [rerunning, setRerunning] = useState(false);
  const sawLive = useRef(false);
  const rerun = async () => {
    if (!item) return;
    setRerunning(true);
    sawLive.current = false;
    try {
      await rerunReview(item.slug);
      toast.success(`Review of !${item.iid} queued`, { description: 'It starts now; this page updates when it is done.' });
    } catch (e) {
      toast.error('Could not re-run the review', { description: (e as Error).message });
      setRerunning(false);
    }
  };
  useEffect(() => {
    if (!rerunning) return;
    if (live) {
      sawLive.current = true;
      return;
    }
    // The run came and went: unlock. If it never showed up (skipped, bot busy), give up after a minute.
    if (sawLive.current) {
      setRerunning(false);
      return;
    }
    const t = setTimeout(() => setRerunning(false), 60_000);
    return () => clearTimeout(t);
  }, [rerunning, live]);
  // Another review on screen: the lock belongs to the one that was re-run.
  useEffect(() => {
    setRerunning(false);
    sawLive.current = false;
  }, [item?.slug]);
  return { rerunning, rerun };
}
