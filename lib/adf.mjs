// Markdown to Atlassian Document Format, for the ticket bodies Marginalia
// creates. Covers what a ticket template uses: headings, paragraphs, bullet and
// numbered lists, tables, rules, fenced code, and `:::note` style panels
// (info, note, warning, success, error), with **bold**, *italic*, `code` and
// links inside. Pure: no I/O, so it is tested on plain strings.

const PANEL = /^:::(info|note|warning|success|error)\s*$/;

export function inline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    // Jira refuses a code mark combined with any other mark but link.
    if (m[1] !== undefined) out.push(...inline(m[1]).map((n) => (n.marks?.some((k) => k.type === 'code') ? n : { ...n, marks: [...(n.marks ?? []), { type: 'strong' }] })));
    else if (m[2] !== undefined) out.push({ type: 'text', text: m[2], marks: [{ type: 'code' }] });
    else if (m[3] !== undefined) out.push({ type: 'text', text: m[3], marks: [{ type: 'link', attrs: { href: m[4] } }] });
    else out.push({ type: 'text', text: m[5], marks: [{ type: 'em' }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out.filter((n) => n.text !== '');
}

const paragraph = (text) => ({ type: 'paragraph', content: inline(text) });
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function table(rows) {
  const [head, , ...body] = rows;
  const row = (r, cellType) => ({
    type: 'tableRow',
    content: cells(r).map((c) => ({ type: cellType, content: [paragraph(c || ' ')] })),
  });
  return { type: 'table', content: [row(head, 'tableHeader'), ...body.map((r) => row(r, 'tableCell'))] };
}

function list(items, ordered) {
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    content: items.map((t) => ({ type: 'listItem', content: [paragraph(t)] })),
  };
}

// Block nodes for a run of lines; panels recurse on their inner lines.
function blocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i += 1; continue; }
    const panel = trimmed.match(PANEL);
    if (panel) {
      const end = lines.findIndex((l, j) => j > i && l.trim() === ':::');
      const stop = end === -1 ? lines.length : end;
      // Jira refuses a table inside a panel: it moves just after the panel.
      const inner = blocks(lines.slice(i + 1, stop));
      const kept = inner.filter((n) => n.type !== 'table');
      if (kept.length) out.push({ type: 'panel', attrs: { panelType: panel[1] }, content: kept });
      out.push(...inner.filter((n) => n.type === 'table'));
      i = stop + 1;
      continue;
    }
    if (trimmed.startsWith('```')) {
      const end = lines.findIndex((l, j) => j > i && l.trim().startsWith('```'));
      const stop = end === -1 ? lines.length : end;
      const language = trimmed.slice(3).trim();
      const code = lines.slice(i + 1, stop).join('\n');
      out.push({ type: 'codeBlock', ...(language ? { attrs: { language } } : {}), content: code ? [{ type: 'text', text: code }] : [] });
      i = stop + 1;
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      out.push({ type: 'heading', attrs: { level: heading[1].length }, content: inline(heading[2]) });
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { out.push({ type: 'rule' }); i += 1; continue; }
    if (trimmed.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      out.push(table(rows));
      continue;
    }
    const item = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/;
    if (item.test(line)) {
      const ordered = Boolean(line.match(item)[1]);
      const items = [];
      while (i < lines.length && item.test(lines[i]) && Boolean(lines[i].match(item)[1]) === ordered) items.push(lines[i++].match(item)[2]);
      out.push(list(items, ordered));
      continue;
    }
    // A paragraph runs until a blank line or the start of another block; its
    // line breaks become hard breaks, as in the user story's three lines.
    const para = [];
    while (i < lines.length && lines[i].trim() && !PANEL.test(lines[i].trim()) && lines[i].trim() !== ':::'
      && !/^(#{1,6}\s|```|\||-{3,}$)/.test(lines[i].trim()) && !item.test(lines[i])) para.push(lines[i++].trim());
    const content = para.flatMap((p, k) => [...(k ? [{ type: 'hardBreak' }] : []), ...inline(p)]);
    out.push({ type: 'paragraph', content });
  }
  return out;
}

export function markdownToAdf(markdown) {
  return { type: 'doc', version: 1, content: blocks(markdown.replace(/\r\n/g, '\n').split('\n')) };
}
