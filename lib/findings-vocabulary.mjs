// The fixed vocabulary of a shape (see findings.mjs), and how the many ways a
// command words a severity or a verdict map onto it.

export const SEVERITIES = ['critical', 'important', 'suggestion', 'info'];
export const VERDICTS = ['APPROVE', 'REQUEST_CHANGES', 'OTHER'];

const SEVERITY_ALIASES = [
  [/^(critical|blocker|blocking|bloquant|bloquante|critique|must[ _-]?fix|high|severe)$/, 'critical'],
  [/^(important|major|majeur|majeure|should[ _-]?fix|warning|medium|moderate)$/, 'important'],
  [/^(suggestion|suggestions|nit|nitpick|minor|mineur|mineure|optional|low|improvement|style)$/, 'suggestion'],
  [/^(info|note|question|praise|positive|fyi)$/, 'info'],
];

export function normalizeSeverity(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return SEVERITY_ALIASES.find(([re]) => re.test(key))?.[1] ?? null;
}

const strip = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function normalizeVerdict(value) {
  if (value === null || value === undefined) return null;
  const v = strip(value).replace(/[*_`]/g, '').trim();
  if (!v) return null;
  if (/^(APPROV|APPROUV|LGTM|ACCEPT|OK\b)/.test(v)) return 'APPROVE';
  if (/REQUEST|CHANGE|REJECT|BLOCK|MODIF|REFUS|NOT APPROV|NEEDS? WORK|DEMANDE/.test(v)) return 'REQUEST_CHANGES';
  return 'OTHER';
}
