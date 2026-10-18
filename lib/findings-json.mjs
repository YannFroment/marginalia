import { normalizeSeverity, normalizeVerdict } from './findings-vocabulary.mjs';
import { buildTour, normalizeOverview, normalizeRisk } from './findings-walkthrough.mjs';
import { assignIds, cleanPath, clip, locate, plain, str } from './findings-text.mjs';

// A finding as written by a command (any extra field is ignored). Returns
// { finding } or { warning }.
function normalizeFinding(raw, index) {
  if (!raw || typeof raw !== 'object') return { warning: `finding #${index + 1} is not an object` };
  const body = str(raw.body ?? raw.description ?? raw.details ?? raw.text, 10_000);
  const title = str(raw.title ?? raw.summary ?? raw.name, 300) ?? (body ? clip(plain(body.split('\n')[0]), 120) : null);
  if (!title) return { warning: `finding #${index + 1} has no title or body` };
  const severity = normalizeSeverity(raw.severity ?? raw.level ?? raw.priority);
  const fallback = locate(`${title} ${body ?? ''}`);
  const path = cleanPath(raw.path ?? raw.file) ?? null;
  const line = Number.isInteger(raw.line) && raw.line >= 1 ? raw.line : null;
  const id = typeof raw.id === 'string' && /^[\w-]{1,56}$/.test(raw.id) ? raw.id : undefined;
  return {
    finding: {
      id,
      severity: severity ?? 'info',
      title,
      path,
      line: path ? line : null,
      body: body ?? title,
      comment: str(raw.comment ?? raw.suggestedComment ?? raw.suggested_comment, 10_000),
      // A skill that names the place in the text but not in `path` still gets anchored.
      ...(path === null && fallback.path ? { path: fallback.path, line: fallback.line } : {}),
    },
    ...(severity === null && raw.severity !== undefined ? { warning: `finding "${clip(title, 40)}" has an unknown severity "${String(raw.severity).slice(0, 20)}", shown as info` } : {}),
  };
}

// Validates and normalizes what a command put in .marginalia-findings.json.
// Lenient: it keeps what it can and says what it dropped.
export function normalizeFindingsData(data) {
  const warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'the file is not a JSON object' };
  if (data.findings !== undefined && !Array.isArray(data.findings)) return { ok: false, error: '"findings" is not an array' };
  const findings = [];
  (data.findings ?? []).forEach((raw, i) => {
    const r = normalizeFinding(raw, i);
    if (r.warning) warnings.push(r.warning);
    if (r.finding) findings.push(r.finding);
  });
  const verdict = normalizeVerdict(data.verdict);
  if (data.verdict !== undefined && data.verdict !== null && verdict === null) warnings.push('the verdict is empty');
  const summary = str(data.summary ?? data.overview, 2000);
  const withIds = assignIds(findings);
  const risk = normalizeRisk(data.risk);
  if (data.risk !== undefined && data.risk !== null && !risk) warnings.push('the risk level is not low, medium or high');
  const walk = buildTour(data.tour, withIds);
  warnings.push(...walk.warnings);
  const { overview, warning: overviewWarning } = normalizeOverview(data.overview);
  if (overviewWarning) warnings.push(overviewWarning);
  else if (!overview && walk.tour.length) warnings.push('the tour has no overview (what the code did before and does now)');
  return { ok: true, verdict, summary: summary ? clip(plain(summary), 400) : null, findings: withIds, risk, overview, tour: walk.tour, warnings };
}

// The command may wrap the JSON in a code fence.
export function parseFindingsJson(raw) {
  let text = String(raw).trim();
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) text = fenced[1];
  try {
    return normalizeFindingsData(JSON.parse(text));
  } catch (err) {
    return { ok: false, error: `not valid JSON (${String(err.message).slice(0, 80)})` };
  }
}
