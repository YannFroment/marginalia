import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { REVIEWS_DIR } from './config.mjs';
import { buildShape, loadShape } from './findings.mjs';
import { compareDiffs, listMergeRequestVersions } from './gitlab-versions.mjs';
import { readHistory, versionTime } from './history.mjs';
import { filesForPatterns, toDiffFile } from './mr-diff.mjs';
import { diffRange, resolveReviewedVersion } from './review-version.mjs';

// The shape of a review and when it was written: the latest one, or an earlier version of it.
async function reviewSource(slug, versionId) {
  if (versionId) {
    const old = await readHistory(slug, versionId);
    return old && { shape: old.shape ?? buildShape({ markdown: old.markdown }), at: Date.parse(versionTime(versionId)) };
  }
  const [shape, written] = await Promise.all([loadShape(REVIEWS_DIR, slug, ''), stat(join(REVIEWS_DIR, `${slug}.md`))]);
  return { shape, at: written.mtime.getTime() };
}

// The changed files of the MR as a review saw it (mode 'full') or as they changed since it
// (mode 'since'), for the latest review or an earlier version of it, optionally those of one
// tour stop. `{ status, error }` when that cannot be told.
export async function reviewDiff(mr, slug, { versionId = null, mode = 'full', stopId = null }) {
  const source = await reviewSource(slug, versionId);
  if (!source) return { status: 404, error: 'no such version of this review' };
  const versions = await listMergeRequestVersions(mr.iid);
  const reviewed = resolveReviewedVersion({ versions, sha: source.shape.reviewedSha, at: source.at });
  const range = diffRange({ mode, reviewed, head: versions[0]?.head_commit_sha ?? null });
  if (range.error) return { status: 404, error: range.error };
  let files = range.from === range.to ? [] : (await compareDiffs(range.from, range.to)).map(toDiffFile);
  if (stopId) {
    const stop = (source.shape.tour ?? []).find((s) => s.id === stopId);
    files = stop ? filesForPatterns(files, stop.files) : [];
  }
  return { status: 200, files, reviewedSha: reviewed.sha, approximate: reviewed.approximate };
}
