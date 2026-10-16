import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { REVIEWS_DIR } from './config.mjs';

// Previous versions of a review. A re-run overwrites <slug>.md, so the file it
// replaces is first copied to .history/<slug>/<timestamp>.md (the timestamp is
// when that version was written). The dot-directory keeps these out of the
// studio's review list, which only reads *.md at the top of REVIEWS_DIR.
const historyDir = (slug) => join(REVIEWS_DIR, '.history', slug);

const idOf = (date) => date.toISOString().replace(/[:.]/g, '-');
// The ISO time an id stands for (the reverse of idOf).
export const versionTime = (id) => id.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');

// Copies the review at `path` aside if it exists and differs from `nextContent`.
// Returns the version id, or null when there was nothing to keep.
export async function archiveReview(path, nextContent) {
  let previous;
  let mtime;
  try {
    [previous, mtime] = await Promise.all([readFile(path, 'utf8'), stat(path).then((s) => s.mtime)]);
  } catch {
    return null;
  }
  if (previous === nextContent) return null;
  const slug = basename(path, '.md');
  const id = idOf(mtime);
  await mkdir(historyDir(slug), { recursive: true });
  await copyFile(path, join(historyDir(slug), `${id}.md`));
  // The normalized findings that went with it, when it had them.
  await copyFile(path.replace(/\.md$/, '.findings.json'), join(historyDir(slug), `${id}.findings.json`)).catch(() => {});
  return id;
}

// Versions of one review, newest first.
export async function listHistory(slug) {
  let names = [];
  try {
    names = (await readdir(historyDir(slug))).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
  return names
    .map((n) => n.slice(0, -3))
    .sort()
    .reverse()
    .map((id) => ({ id, at: versionTime(id) }));
}

// { markdown, shape } of one version; shape is null for a version kept before
// findings were stored (the caller derives one from the markdown).
export async function readHistory(slug, id) {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    const markdown = await readFile(join(historyDir(slug), `${id}.md`), 'utf8');
    const shape = await readFile(join(historyDir(slug), `${id}.findings.json`), 'utf8').then(JSON.parse, () => null);
    return { markdown, shape };
  } catch {
    return null;
  }
}

const MAX_THREAD_CHARS = 6000;

// What the re-run is told about the conversation so far, so it neither repeats a
// point the author already addressed nor ignores a reply. Skill-agnostic: it is
// plain text appended to the system prompt, whatever the review command is.
export function discussionPrompt(threads) {
  if (!threads.length) return '';
  const lines = [];
  for (const t of threads) {
    const where = t.path ? ` on ${t.path}${t.line ? `:${t.line}` : ''}` : '';
    lines.push(`- Thread${where}${t.resolved ? ' (resolved)' : ''}:`);
    for (const n of t.notes) lines.push(`  - ${n.mine ? 'me (the reviewer)' : n.author}: ${n.body.replace(/\s+/g, ' ').trim()}`);
  }
  let text = lines.join('\n');
  if (text.length > MAX_THREAD_CHARS) text = `${text.slice(0, MAX_THREAD_CHARS)}\n  [...truncated]`;
  return [
    'This merge request already has a review conversation on GitLab (below). The author may have pushed fixes in reply.',
    'Do not repeat a point that was addressed. If a reply claims a fix, check the code and say so only if it is not actually fixed or is only partly fixed. Mention anything a reply left open.',
    '',
    text,
  ].join('\n');
}
