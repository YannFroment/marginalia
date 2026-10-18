import type { ReviewContent } from '../lib/api';

// Why a report reads the way it does: an old version on screen, or findings the studio could not read.
export function ReaderNotices({ viewingOld, onBackToLatest, shape }: { viewingOld: boolean; onBackToLatest: () => void; shape: ReviewContent["shape"] | null }) {
  return (
    <>
      {viewingOld && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          You are reading an earlier version of this review. Comments can't be posted from it.{' '}
          <button className="underline" onClick={onBackToLatest}>Back to the latest</button>
        </p>
      )}
      {shape && shape.warnings.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">{shape.source === 'none' ? 'This report has no findings the studio could read' : 'About how this report was read'}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{shape.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </>
  );
}
