import { encodedProjectId } from './config.mjs';
import { gitlabRequest } from './gitlab.mjs';

// The versions of an MR (one per push), newest first, and the diff between two commits.
export const listMergeRequestVersions = (iid) => gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}/versions?per_page=100`);

// `straight` compares the two trees as they are, whatever their merge base.
export async function compareDiffs(from, to) {
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&straight=true`;
  return (await gitlabRequest(`/projects/${encodedProjectId}/repository/compare?${query}`)).diffs ?? [];
}
