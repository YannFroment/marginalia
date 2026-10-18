// The prompt that drafts suggested tickets, and the reading of the model's
// answer. Pure: the flow (suggest.mjs) reads the files and runs the model.

// A reference file cut to what the model needs: its title, its one-line
// summary and its takeaways. Long articles keep their first lines only.
export function digestReference(name, text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? name.replace(/\.md$/, '');
  const quote = body.match(/^>\s*(.+)$/m)?.[1]?.trim() ?? '';
  const takeaways = body.match(/##\s*Takeaways\s*\n([\s\S]*?)(?:\n##\s|$)/)?.[1]?.trim() ?? '';
  const gist = takeaways || body.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 6).join('\n');
  return `### ${title} (${name})\n${quote}\n${gist}`.slice(0, 1400).trim();
}

export function buildPrompt({ focus, area, count, references, template, openTickets, previous }) {
  return [
    `You look for improvements worth a ticket in the code of this repository: ${focus}.`,
    area ? `This run covers ${area} only. Read the code there (and what it imports when needed) with Read, Grep and Glob.` : 'Read the code with Read, Grep and Glob.',
    'Every suggestion must rest on code you have read: name the files and lines, and say what a user sees today. Do not invent behaviour you did not find in the code. Prefer a few well-founded suggestions to many weak ones; returning fewer, or none, is fine.',
    `Return at most ${count} suggestions.`,
    references.length ? `## References\n\nJudge the interface against these principles, and name the one each suggestion applies.\n\n${references.join('\n\n')}` : '',
    template ? `## Ticket template and writing rules\n\nWrite each ticket body with this template and these rules. Ignore any step about tools, projects or writing to Jira: you only draft the text.\n\n${template}` : '',
    openTickets.length ? `## Tickets already open (do not suggest the same work)\n\n${openTickets.map((t) => `- ${t}`).join('\n')}` : '',
    previous.length ? `## Already suggested (do not repeat)\n\n${previous.map((t) => `- ${t}`).join('\n')}` : '',
    '## Answer',
    'Answer with a JSON array only, no prose around it. One object per suggestion:',
    '{"title": "<ticket title, following the template>", "principle": "<the reference it applies, or a short category>", "files": ["<path:line>", "..."], "why": "<one sentence: what the user meets today and what changes>", "body": "<the full ticket description in markdown, following the template>"}',
  ].filter(Boolean).join('\n\n');
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// The suggestions in the model's answer, each with the fields the studio
// shows; anything malformed is dropped rather than shown half-filled.
export function parseSuggestions(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let raw;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    title: str(s?.title, 250),
    principle: str(s?.principle, 80),
    files: Array.isArray(s?.files) ? s.files.filter((f) => typeof f === 'string').map((f) => f.trim().slice(0, 200)).slice(0, 12) : [],
    why: str(s?.why, 400),
    body: str(s?.body, 20_000),
  })).filter((s) => s.title && s.body);
}

// The next area to scan: the one after the last scanned, in the configured order.
export function nextArea(areas, last) {
  if (!areas.length) return '';
  const i = areas.indexOf(last);
  return areas[(i + 1) % areas.length];
}

// The second run: one ticket, checked claim by claim against the code.
export function buildVerifyPrompt(s) {
  return [
    'Check this ticket draft against the code of this repository, with Read, Grep and Glob.',
    'For every statement about the code or about what a user sees (a file, a line, a value, a component that does or does not read something, a missing button), open the code and decide whether it is true at this commit.',
    `Files it cites: ${s.files.join(', ') || 'none'}.`,
    `## Title\n\n${s.title}\n\n## Body\n\n${s.body}`,
    'Answer with JSON only: {"ok": true|false, "problems": ["<one false or unverifiable statement, quoted, and what the code says instead>"]}. ok is true only when every statement holds.',
  ].join('\n\n');
}

// The verdict in the model's answer; an unreadable answer counts as unverified.
export function parseVerdict(text) {
  try {
    const v = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const problems = Array.isArray(v.problems) ? v.problems.filter((p) => typeof p === 'string').map((p) => p.slice(0, 400)).slice(0, 8) : [];
    return { ok: v.ok === true && !problems.length, problems };
  } catch {
    return { ok: false, problems: ['the verification answer could not be read'] };
  }
}
