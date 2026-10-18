import { createHash } from 'node:crypto';

// Text helpers shared by the JSON and markdown readers of findings.

export const plain = (t) => t
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*`>]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
export const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

// A repo-relative path (it has a slash and an extension), with an optional line.
const PATH_IN_TEXT = /(?<![\w/.:@-])((?:\.\/)?(?:[\w@.~-]+\/)+[\w@.~-]+\.[A-Za-z0-9]+)(?::(\d+)(?:-\d+)?)?/;

export function cleanPath(path) {
  if (typeof path !== 'string') return null;
  const p = path.trim().replace(/^(\.\/|[ab]\/)/, '');
  return p && p.length <= 500 && !p.includes('\0') ? p : null;
}

// A file at the repo root (`.gitlab-ci.yml`, `package.json`): no directory, so only a
// well-known extension keeps "Next.js" or "e.g." from passing for a file.
const ROOT_FILE_IN_TEXT = /(?<![\w/.:@-])(\.?[\w@-]+(?:\.[\w@-]+)*\.(?:tsx?|mjs|cjs|json|ya?ml|md|toml|lock|sh))(?::(\d+)(?:-\d+)?)?(?![\w/])/;

// A path with a directory is a surer anchor than a bare file name.
export function locate(text) {
  const m = text.match(PATH_IN_TEXT) ?? text.match(ROOT_FILE_IN_TEXT);
  if (!m) return { path: null, line: null };
  return { path: cleanPath(m[1]), line: m[2] ? Number(m[2]) : null };
}

const normTitle = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Stable across re-runs: it names the place and the point, not the wording of
// the comment, so a reworded comment is still the same finding.
export function findingId({ path, title, body }) {
  const subject = normTitle(title || body || '').slice(0, 80);
  return createHash('sha1').update(`${path ?? ''}|${subject}`).digest('hex').slice(0, 10);
}

export function assignIds(findings) {
  const seen = new Set();
  return findings.map((f) => {
    const base = f.id ?? findingId(f);
    let id = base;
    for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
    seen.add(id);
    return { ...f, id };
  });
}

export const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
