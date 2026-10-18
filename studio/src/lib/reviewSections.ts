export interface Section {
  id: string;
  title: string;
  body: string;
}

// Reading order: what the MR does first, then what to act on, then the supporting
// sections. Reviews written before "At a Glance" existed just skip those ranks.
const SECTION_RANKS: [RegExp, number][] = [
  [/summary/i, 0],
  [/at a glance/i, 1],
  [/shape of the change/i, 2],
  [/critical/i, 3],
  [/important/i, 4],
  [/suggestion/i, 5],
  [/out of scope/i, 6],
];
export const SUPPORTING_RANK = 7;
export const rankOf = (title: string) => SECTION_RANKS.find(([re]) => re.test(title))?.[1] ?? SUPPORTING_RANK;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

// Splits on "## " / "### " headings, ignoring fenced code blocks.
export function splitSections(md: string): { intro: string; sections: Section[] } {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let intro: string[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  let fence = false;
  const flush = () => {
    if (!cur) return;
    sections.push({ id: `${slugify(cur.title)}-${sections.length}`, title: cur.title, body: cur.lines.join('\n') });
  };
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && line.match(/^#{2,3}\s+(.+)$/);
    if (h) {
      flush();
      cur = { title: h[1].replace(/[*`]/g, ''), lines: [] };
    } else if (cur) cur.lines.push(line);
    else intro.push(line);
  }
  flush();
  return { intro: intro.join('\n'), sections };
}

// The "**Branch:** x | **Ticket:** y | **MR:** !n" line of the summary: pulled out of
// the text, since the side panel shows it (with links).
const META_LINE = /^[ \t]*\*\*Branch:\*\*[ \t]*(.*?)[ \t]*\|[ \t]*\*\*Ticket:\*\*[ \t]*(.*?)[ \t]*\|[ \t]*\*\*MR:\*\*[ \t]*(.*?)[ \t]*$\n?/m;
const TICKET_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
// The Ticket field is free text ("ESD-1446 (Jira not reachable…)"): only the key is kept,
// the rest goes to a tooltip.
export function extractMeta(md: string): { markdown: string; ticket: { key: string; note: string | null } | null } {
  const m = md.match(META_LINE);
  if (!m) return { markdown: md, ticket: null };
  const raw = m[2].replace(/[*`[\]]/g, '').trim();
  const key = raw.match(TICKET_KEY)?.[0];
  return { markdown: md.replace(META_LINE, ''), ticket: key ? { key, note: raw === key ? null : raw } : null };
}
