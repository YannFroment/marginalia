import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFindingsJson } from './findings-json.mjs';
import { deriveFromMarkdown } from './findings-markdown.mjs';
import { clip, plain } from './findings-text.mjs';

export { SEVERITIES, VERDICTS, normalizeSeverity, normalizeVerdict } from './findings-vocabulary.mjs';
export { cleanPath, findingId } from './findings-text.mjs';
export { RISK_LEVELS } from './findings-walkthrough.mjs';
export { normalizeFindingsData, parseFindingsJson } from './findings-json.mjs';
export { deriveFromMarkdown, extractSummary, findingsFromMarkdown, parseVerdict } from './findings-markdown.mjs';

// What the studio relies on, whatever skill or command wrote the review.
//
// A review command is free to write its report however it likes. This module
// turns that report into one normalized "shape", with a fixed vocabulary:
//
//   { version: 1, source, verdict, summary, risk, overview, tour, findings, warnings }
//
// - verdict:  'APPROVE' | 'REQUEST_CHANGES' | 'OTHER' | null
// - findings: [{ id, severity, title, path, line, body, comment }]
//             severity is 'critical' | 'important' | 'suggestion' | 'info'
//             comment is the text ready to post on the MR, or null
// - risk:     { level: 'low' | 'medium' | 'high', rationale, factors } or null
// - overview: { before, after } in plain words, or null
// - tour:     [{ id, title, summary, files, findingIds, supporting }]: the order to read the
//             MR in, core first and supporting stops (tests, database, generated) last, or []
//             (only the structured file can carry risk, overview and tour)
// - source:   where the shape came from, in order of preference:
//               'json'      the command wrote .marginalia-findings.json
//               'markdown'  read from the report's sections and blockquotes
//               'none'      nothing could be read; the studio says so
// - warnings: what the studio should tell the person (never silent degradation)
//
// The shape is written next to the report (<slug>.findings.json) and is what
// the studio lists, counts and posts from. The readers behind it live in
// findings-json.mjs (the structured file) and findings-markdown.mjs (the report).

// Where the injected contract asks the run to write its structured findings.
export const FINDINGS_FILE = '.marginalia-findings.json';

export const NO_FINDINGS_WARNING = 'No findings could be read from this report: it has no structured findings file and no Critical / Important / Suggestion sections. Per-finding "Add to review" is unavailable; use the comment box under Discussion.';

// `findingsRaw` is the content of .marginalia-findings.json, or null when the
// command wrote none.
export function buildShape({ markdown, findingsRaw = null }) {
  const warnings = [];
  const derived = deriveFromMarkdown(markdown);
  if (findingsRaw !== null) {
    const parsed = parseFindingsJson(findingsRaw);
    if (!parsed.ok) {
      warnings.push(`The findings file was ignored: ${parsed.error}.`);
    } else if (!parsed.findings.length && !parsed.verdict) {
      warnings.push('The findings file was ignored: it has no findings and no verdict.');
    } else {
      warnings.push(...parsed.warnings.map((w) => `Findings file: ${w}.`));
      return {
        version: 1,
        source: 'json',
        verdict: parsed.verdict ?? derived.verdict,
        summary: parsed.summary ?? derived.summary,
        findings: parsed.findings,
        risk: parsed.risk,
        overview: parsed.overview,
        tour: parsed.tour,
        warnings,
      };
    }
  }
  if (!derived.findings.length) warnings.push(NO_FINDINGS_WARNING);
  else if (derived.verdict === null) warnings.push('No verdict was found in this report.');
  return {
    version: 1,
    source: derived.findings.length ? 'markdown' : 'none',
    verdict: derived.verdict,
    summary: derived.summary,
    findings: derived.findings,
    risk: null,
    overview: null,
    tour: [],
    warnings,
  };
}

// What the studio's review list shows, from a shape.
export function listFields(shape) {
  const count = (s) => shape.findings.filter((f) => f.severity === s).length;
  const highlights = [];
  for (const severity of ['critical', 'important']) {
    for (const f of shape.findings.filter((x) => x.severity === severity).slice(0, 2)) {
      highlights.push({ severity, text: clip(plain(f.body), 150) });
    }
  }
  return {
    verdict: shape.verdict,
    risk: shape.risk?.level ?? null,
    critical: count('critical'),
    important: count('important'),
    summary: shape.summary,
    highlights,
    postable: shape.findings.filter((f) => f.comment).length,
    contract: { source: shape.source, warnings: shape.warnings },
  };
}

export const shapePath = (reviewsDir, slug) => join(reviewsDir, `${slug}.findings.json`);

// The shape stored next to a review, or one derived from the markdown for a
// review written before shapes were stored.
export async function loadShape(reviewsDir, slug, markdown) {
  try {
    const stored = JSON.parse(await readFile(shapePath(reviewsDir, slug), 'utf8'));
    if (stored?.version === 1 && Array.isArray(stored.findings)) return stored;
  } catch {
    /* no stored shape */
  }
  return buildShape({ markdown });
}
