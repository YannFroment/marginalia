import { normalizeVerdict } from './findings-vocabulary.mjs';
import { assignIds, clip, locate, plain } from './findings-text.mjs';

// Reading a report that has no structured findings file.

// Tolerates "**Verdict:**", "**Verdict :**", "**Verdict**:" and French labels.
const VERDICT_LINE = /\*\*\s*(?:verdict|d[ée]cision|conclusion)\s*:?\s*\*\*\s*:?\s*([^\n]+)/i;

export function parseVerdict(md) {
  const m = md.match(VERDICT_LINE);
  return m ? normalizeVerdict(m[1]) : null;
}

const HEADING_SEVERITIES = [
  [/critical|critique|blocker|blocking|bloquant|must[ -]fix/i, 'critical'],
  [/important|major|majeur|should[ -]fix|warning|[àa] corriger/i, 'important'],
  [/suggestion|nit|minor|mineur|optional|improvement|am[ée]lioration/i, 'suggestion'],
];

const NOTHING = /^[-*]\s+(none|no\b|n\/a|nothing|rien|aucun)/i;

// Short text shown on cards: the "Overview" line, else the first real paragraph.
export function extractSummary(md) {
  const overview = md.match(/\*\*(?:Overview|Summary|R[ée]sum[ée])\s*:\s*\*\*\s*([^\n]+)/i)?.[1];
  if (overview) return clip(plain(overview), 400);
  const para = md.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p.length > 40 && !/^[#|>\-*`]/.test(p));
  return para ? clip(plain(para), 400) : null;
}

function toFinding(severity, lines) {
  const quote = [];
  const rest = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) quote.push(l);
    // The label before a comment: the studio's card already carries it.
    else if (!/^\s*\**comment to post\s*:?\**\s*$/i.test(l)) rest.push(l);
  }
  const body = rest.join('\n').replace(/^[-*]\s+/, '').trim();
  const comment = quote
    .map((l) => l.replace(/^\s*>\s?/, ''))
    .filter((l, i) => !(i === 0 && /^comment to post\s*:?$/i.test(l.replace(/\*/g, '').trim())))
    .join('\n')
    .trim();
  const bold = body.match(/^\*\*([^*]+)\*\*/)?.[1];
  const firstLine = plain(body.split('\n')[0]);
  const title = clip(plain(bold ?? firstLine) || plain(comment.split('\n')[0]), 120);
  if (!title) return null;
  const here = locate(body.split(/\n\s*\n/)[0]);
  const { path, line } = here.path ? here : locate(comment);
  return { severity, title, path, line: path ? line : null, body: body || comment, comment: comment || null };
}

// Findings under "Critical / Important / Suggestions"-style headings: each
// top-level bullet is one finding, and a blockquote under it is its comment.
// A blockquote with no bullet above it is a finding of its own.
export function findingsFromMarkdown(md) {
  const out = [];
  let severity = null;
  let fence = false;
  let current = null;
  const flush = () => {
    if (current) {
      const f = toFinding(severity ?? 'info', current);
      if (f) out.push(f);
    }
    current = null;
  };
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    if (!fence && /^#{2,3}\s/.test(line)) {
      flush();
      severity = HEADING_SEVERITIES.find(([re]) => re.test(line))?.[1] ?? null;
      continue;
    }
    if (!severity) continue;
    if (!fence && /^[-*]\s/.test(line)) {
      flush();
      if (!NOTHING.test(line)) current = [line];
      continue;
    }
    if (!fence && /^\s*>/.test(line) && current === null) {
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  flush();
  return out;
}

export function deriveFromMarkdown(md) {
  return {
    verdict: parseVerdict(md),
    summary: extractSummary(md),
    findings: assignIds(findingsFromMarkdown(md)),
  };
}
