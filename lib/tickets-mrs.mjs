import { GITLAB_BASE_URL, GITLAB_TOKEN } from './config.mjs';
import { gitlabRequest } from './gitlab.mjs';
import { PROD_MANIFEST, mrProjects } from './tickets-config.mjs';

const KEYS_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const MR_DAYS = 120;
const keysIn = (text) => new Set([...(text ?? '').matchAll(KEYS_RE)].map((m) => m[1]));

// Ticket key -> MRs that name it, over the last MR_DAYS days of every project in
// TICKET_MR_PROJECTS. `direct`: named in the title or branch, so the MR does the
// ticket's work; only cited in the description, it may just refer to it.
export async function mrsByKey() {
  const since = new Date(Date.now() - MR_DAYS * 86_400_000).toISOString();
  const byKey = new Map();
  for (const project of mrProjects) {
    for (let page = 1; page <= 20; page += 1) {
      const mrs = await gitlabRequest(`/projects/${project.id}/merge_requests?state=all&updated_after=${since}&per_page=100&page=${page}`);
      for (const mr of mrs) {
        const direct = keysIn(`${mr.title} ${mr.source_branch.toUpperCase()}`);
        for (const key of new Set([...direct, ...keysIn(mr.description)])) {
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push({
            project: project.path, manifestName: project.manifestName, iid: mr.iid, title: mr.title, state: mr.state,
            author: mr.author?.username, webUrl: mr.web_url, mergedAt: mr.merged_at,
            mergeSha: mr.merge_commit_sha || mr.squash_commit_sha || null,
            direct: direct.has(key),
          });
        }
      }
      if (mrs.length < 100) break;
    }
  }
  return byKey;
}

async function gitlabRaw(path) {
  const res = await fetch(`${GITLAB_BASE_URL}/api/v4${path}`, { headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN } });
  if (!res.ok) throw new Error(`GitLab API ${path} -> ${res.status}`);
  return res.text();
}

// Service -> tag currently in prod, from PROD_MANIFEST.
export async function prodTags() {
  if (!PROD_MANIFEST) return {};
  const [project, ref, ...path] = PROD_MANIFEST.split(':');
  const text = await gitlabRaw(`/projects/${encodeURIComponent(project)}/repository/files/${encodeURIComponent(path.join(':'))}/raw?ref=${encodeURIComponent(ref)}`);
  return Object.fromEntries(text.split('\n').map((l) => l.split(':').map((s) => s.trim())).filter(([k, v]) => k && v && !k.startsWith('#')));
}

// Is this commit in that tag (an ancestor of it)?
export async function inTag(project, sha, tag) {
  const base = await gitlabRequest(`/projects/${encodeURIComponent(project)}/repository/merge_base?refs[]=${sha}&refs[]=${encodeURIComponent(tag)}`);
  return base?.id === sha;
}
