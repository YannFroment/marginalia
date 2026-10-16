import { listDiscussions } from './gitlab.mjs';
import { listMergeRequestVersions } from './gitlab-versions.mjs';

// The threads of the MR that sit on a line of code, for the studio's diff. `outdated` is a
// thread opened on an earlier version of the MR than its head now: its line may have moved.
export async function reviewThreads(mr) {
  const [threads, versions] = await Promise.all([listDiscussions(mr.iid), listMergeRequestVersions(mr.iid).catch(() => [])]);
  const head = versions[0]?.head_commit_sha ?? null;
  return threads.filter((t) => t.path).map((t) => ({ ...t, outdated: Boolean(head && t.headSha && t.headSha !== head) }));
}
