import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { openInIde, submitReview, type BotStatus, type PostedInfo, type ReviewContent, type ReviewItem } from '../lib/api';
import { LinkContext } from '../lib/links';
import { cn } from '../lib/utils';
import { useRerun } from '../lib/useRerun';
import { useReviewVersions } from '../lib/useReviewVersions';
import { useSectionState } from '../lib/useSectionState';
import { squash } from '../lib/reviewComments';
import { PostContext } from '../lib/reviewContexts';
import { extractMeta, rankOf, SUPPORTING_RANK, splitSections } from '../lib/reviewSections';
import { CollapsibleCard } from './CollapsibleCard';
import { ConfirmSubmit } from './ConfirmSubmit';
import { FindingsPanel } from './FindingsPanel';
import { FixesPanel } from './FixesPanel';
import { ReaderHeader } from './ReaderHeader';
import { ReportSections } from './ReportSections';
import { ReaderNotices } from './ReaderNotices';
import { ReviewOverview } from './ReviewOverview';
import { ReviewTour } from './ReviewTour';
import { ReviewerTools } from './ReviewerTools';
import { ReviewChat } from './ReviewChat';
import { ToolsContext } from '../lib/toolsContext';
import type { CommentRef } from '../lib/comments';
import type { BotState } from './TabIcon';
import { TourSkeleton } from './ReviewSkeleton';
import { Button } from './ui/Button';

export function ReviewReader({ item, review: currentReview, reviewError, onRetry, projectUrl, allowPosting, allowPush, live, posted, reload, diffInIdeEnabled = false, ideEnabled = false, deepenEnabled = false, qaEnabled = false, botState }: { item: ReviewItem | undefined; review: ReviewContent | null; reviewError: string | null; onRetry: () => void; projectUrl: string | null; allowPosting: boolean; allowPush: boolean; live: BotStatus['current']; posted: Record<string, PostedInfo>; reload: () => void; diffInIdeEnabled?: boolean; ideEnabled?: boolean; deepenEnabled?: boolean; qaEnabled?: boolean; botState?: BotState }) {
  const [submitting, setSubmitting] = useState(false);
  const [about, setAbout] = useState<CommentRef | null>(null);
  const slugForTools = item?.slug ?? null;
  const openFile = useCallback((path: string, line: number) => {
    if (!slugForTools) return;
    openInIde(slugForTools, path, line).catch((e: Error) => toast.error('Could not open the IDE', { description: e.message }));
  }, [slugForTools]);
  const toolsCtx = useMemo(() => ({
    askAbout: item?.resumeCommand ? setAbout : null,
    openInIde: ideEnabled && item?.tracked ? openFile : null,
  }), [item?.resumeCommand, item?.tracked, ideEnabled, openFile]);
  const { versions, versionId, setVersionId, oldReview } = useReviewVersions(item?.slug, item?.reviewedAt);
  const viewingOld = versionId !== null;
  const content = viewingOld ? oldReview : currentReview;
  const markdown = content?.markdown ?? null;
  const shape = content?.shape ?? null;
  const { rerunning, rerun } = useRerun(item, live);
  const draftCount = item ? Object.entries(posted).filter(([k, p]) => k.startsWith(`${item.slug}:`) && p.state === 'draft').length : 0;
  const locked = rerunning || Boolean(live) || viewingOld;
  const postCtx = useMemo(() => ({ allowPosting, slug: item?.slug ?? null, iid: item?.tracked ? item.iid : null, posted, reload, locked, findings: shape?.findings ?? [] }), [allowPosting, item?.slug, item?.tracked, item?.iid, posted, reload, locked, shape]);
  const linkCtx = useMemo(() => ({ projectUrl, branch: item?.branch ?? null, mrWebUrl: item?.webUrl ?? null }), [projectUrl, item?.branch, item?.webUrl]);
  const meta = useMemo(() => extractMeta(markdown ?? ''), [markdown]);
  // Findings the person can't reach otherwise: with a tour, the ones no chapter holds; without one,
  // those with no comment card in the report's own text.
  const loose = useMemo(() => {
    const findings = shape?.findings ?? [];
    const tour = shape?.tour ?? [];
    if (tour.length) return findings.filter((f) => !tour.some((s) => s.findingIds.includes(f.id)));
    const text = squash(markdown ?? '');
    return findings.filter((f) => (f.comment ? !text.includes(squash(f.comment)) : !text.includes(squash(f.body).slice(0, 120))));
  }, [markdown, shape]);
  const { intro, sections } = useMemo(() => splitSections(meta.markdown), [meta]);
  const ordered = useMemo(
    () => sections.map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s.title) - rankOf(b.s.title) || a.i - b.i).map((x) => x.s),
    [sections],
  );
  const firstSupporting = ordered.find((s) => rankOf(s.title) === SUPPORTING_RANK && ordered.some((o) => rankOf(o.title) < SUPPORTING_RANK))?.id;
  const { overrides, setOverrides, isOpen } = useSectionState(sections);
  // A review with a tour is read through its tour; the written report only stands in for one without.
  const hasTour = (shape?.tour?.length ?? 0) > 0;

  return (
    <LinkContext.Provider value={linkCtx}>
    <PostContext.Provider value={postCtx}>
    <ToolsContext.Provider value={toolsCtx}>
    <div className="px-6 py-6">
      {/* A review with a tour fits the window: header and overview on top, the tour taking the rest
          with each pane scrolling inside it. What comes after is below, on the page. */}
      <div className={cn((hasTour || markdown === null) && 'lg:flex lg:h-[calc(100vh-var(--chrome-h)-3rem)] lg:flex-col')}>
      <ReaderHeader
        item={item}
        risk={shape?.risk ?? null}
        showSubmit={allowPosting && Boolean(item?.tracked) && (draftCount > 0 || item?.kind === 'review')}
        draftCount={draftCount}
        onSubmit={() => setSubmitting(true)}
        versions={versions}
        versionId={versionId}
        onVersion={setVersionId}
        locked={locked}
        onRerun={rerun}
      />
      {item && <ReviewerTools item={item} diffInIdeEnabled={diffInIdeEnabled} deepenEnabled={deepenEnabled} qaEnabled={qaEnabled} botState={botState} />}
      {markdown === null && (reviewError && !viewingOld ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-4 text-sm text-fg-muted dark:border-zinc-800">
          <span>This review could not be loaded ({reviewError}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : <TourSkeleton />)}
      {markdown !== null && shape?.overview && <ReviewOverview overview={shape.overview} />}
      {markdown !== null && hasTour && (
          <ReviewTour stops={shape!.tour!} findings={shape!.findings} diff={item?.tracked && item.iid ? { slug: item.slug, version: versionId, key: item.reviewedAt, startSince: item.stale } : null} post={item?.tracked && item.iid && !viewingOld ? { slug: item.slug, iid: item.iid, allowPosting, locked, posted, reload } : null} />
      )}
      </div>

      {markdown !== null && (
        <article className="mx-auto w-full min-w-0 max-w-[80ch] space-y-3">
            <ReaderNotices viewingOld={viewingOld} onBackToLatest={() => setVersionId(null)} shape={shape} />
            {!hasTour && <ReportSections intro={intro} sections={ordered} firstSupporting={firstSupporting} isOpen={isOpen} setOverrides={setOverrides} />}
            {item?.tracked && item.iid && !viewingOld && loose.length > 0 && (
              <CollapsibleCard id="findings" title={`${hasTour ? 'Other findings' : 'Findings to comment on'} (${loose.length})`} open={overrides.findings ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, findings: o }))}>
                <FindingsPanel findings={loose} slug={item.slug} iid={item.iid} allowPosting={allowPosting} locked={locked} posted={posted} reload={reload} />
              </CollapsibleCard>
            )}
            {item?.tracked && item.iid && item.kind === 'comments' && !viewingOld && (
              <CollapsibleCard id="fixes" title="Fixes to push" open={overrides.fixes ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, fixes: o }))}>
                <FixesPanel slug={item.slug} iid={item.iid} allowPush={allowPush} locked={locked} refreshKey={item.reviewedAt} />
              </CollapsibleCard>
            )}
          </article>
      )}
      {item?.resumeCommand && (
        <div className="mx-auto mt-6 w-full max-w-[80ch]">
          <ReviewChat slug={item.slug} about={about} onClearAbout={() => setAbout(null)} />
        </div>
      )}
    </div>
    {submitting && item?.iid && (
      <ConfirmSubmit
        slug={item.slug}
        reload={reload}
        iid={item.iid}
        count={draftCount}
        canVerdict={item.kind === 'review'}
        onCancel={() => setSubmitting(false)}
        onConfirm={async (summary, action) => {
          await submitReview(item.slug, summary.trim() || undefined, action);
          setSubmitting(false);
          reload();
          const done = { comment: 'submitted', approve: 'approved', request_changes: 'submitted with changes requested' }[action];
          toast.success(`Review of !${item.iid} ${done}`, item.webUrl ? { action: { label: 'Open', onClick: () => window.open(item.webUrl!, '_blank', 'noopener') } } : undefined);
        }}
      />
    )}
    </ToolsContext.Provider>
    </PostContext.Provider>
    </LinkContext.Provider>
  );
}
