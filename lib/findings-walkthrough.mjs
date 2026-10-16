import { cleanPath, clip, plain, str } from './findings-text.mjs';
import { firstSentence, technicalWord } from './plain-words.mjs';
import { coreFirst, isSupportingStop } from './supporting-files.mjs';

// What gives a reader the whole picture of a review, beyond the list of findings: how
// risky the MR is, what changed before and after, and the order to read it in.

export const RISK_LEVELS = ['low', 'medium', 'high'];

const RISK_ALIASES = [
  [/^(low|minor|safe|trivial|small)$/, 'low'],
  [/^(medium|moderate|mid|average)$/, 'medium'],
  [/^(high|major|risky|critical|severe|dangerous)$/, 'high'],
];

export function normalizeRiskLevel(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return RISK_ALIASES.find(([re]) => re.test(key))?.[1] ?? null;
}

// { level, rationale, factors } or null. A bare string ("high") is accepted.
export function normalizeRisk(raw) {
  const level = normalizeRiskLevel(raw && typeof raw === 'object' ? raw.level ?? raw.risk : raw);
  if (!level) return null;
  const obj = raw && typeof raw === 'object' ? raw : {};
  const rationale = str(obj.rationale ?? obj.reason ?? obj.why, 1000);
  const factors = (Array.isArray(obj.factors) ? obj.factors : [])
    .map((f) => str(f, 200))
    .filter(Boolean)
    .slice(0, 6);
  return { level, rationale: rationale ? clip(plain(rationale), 400) : null, factors };
}

// The before and after of the change, in plain words: { before, after } or null. Both are
// needed (one alone explains nothing); a half-written overview is a warning, not a crash.
export function normalizeOverview(raw) {
  if (raw === undefined || raw === null) return { overview: null };
  const part = (v) => { const t = str(v, 1000); return t ? clip(plain(t), 500) : null; };
  const before = part(raw?.before);
  const after = part(raw?.after);
  if (!before || !after) return { overview: null, warning: 'the overview needs both "before" and "after"' };
  const word = technicalWord(before) ?? technicalWord(after);
  return { overview: { before, after }, ...(word ? { warning: `the overview names code (${word}); it should read in plain words` } : {}) };
}

// Ordered stops of a guided read, the core of the change first and the supporting stops
// (tests, database, generated files) last whatever order they came in. `findingIds` come
// from the stop's own list of ids, plus every finding anchored on one of its files that no
// stop claimed. Returns { tour, warnings }; a stop with no title and no summary is dropped.
export function buildTour(raw, findings) {
  if (raw === undefined || raw === null) return { tour: [], warnings: [] };
  if (!Array.isArray(raw)) return { tour: [], warnings: ['"tour" is not an array'] };
  const known = new Set(findings.map((f) => f.id));
  const claimed = new Set();
  const warnings = [];
  const stops = [];
  raw.forEach((s, i) => {
    const title = str(s?.title ?? s?.name, 200);
    const summary = str(s?.summary ?? s?.description ?? s?.body, 2000);
    if (!title && !summary) {
      warnings.push(`tour stop #${i + 1} has no title or summary`);
      return;
    }
    const files = (Array.isArray(s.files) ? s.files : []).map((f) => cleanPath(typeof f === 'object' ? f?.path : f)).filter(Boolean);
    const ids = (Array.isArray(s.findings) ? s.findings : []).filter((id) => known.has(id));
    ids.forEach((id) => claimed.add(id));
    stops.push({ title: title ?? clip(plain(summary), 80), summary: summary ?? null, files, findingIds: ids, supporting: isSupportingStop(files) });
  });
  for (const f of findings) {
    if (claimed.has(f.id) || !f.path) continue;
    stops.find((s) => s.files.includes(f.path))?.findingIds.push(f.id);
  }
  const technical = stops.filter((s) => technicalWord(s.title) ?? technicalWord(firstSentence(s.summary)));
  if (technical.length) warnings.push(`${technical.length} of ${stops.length} chapters name code instead of explaining the idea in plain words: ${technical.slice(0, 3).map((s) => `"${clip(s.title, 40)}"`).join(', ')}`);
  return { tour: coreFirst(stops).map((s, i) => ({ id: `stop-${i + 1}`, ...s })), warnings };
}
