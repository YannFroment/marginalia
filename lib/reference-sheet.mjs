// Reads the criterion sheets of the references library. Marginalia reparses
// their frontmatter itself and imports nothing from the factory that writes them.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const KEYS = new Set(['titre', 'etage', 'critere', 'seuil', 'mesure', 'principes']);
const SKIPPED_FILES = /^(index|info|book|README|_gabarit-fiche|sources)\.md$/;

const unquote = (v) => {
  const t = v.trim();
  return t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\(["\\])/g, '$1') : t;
};

function splitList(inner) {
  const items = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '\\' && quoted) { cur += c + (inner[++i] ?? ''); continue; }
    if (c === '"') quoted = !quoted;
    if (c === ',' && !quoted) { items.push(cur); cur = ''; continue; }
    cur += c;
  }
  items.push(cur);
  return items.map(unquote).filter(Boolean);
}

// The known keys of a sheet's frontmatter, or null when the file has none.
export function parseSheet(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (block === undefined) return null;
  const sheet = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!m || !KEYS.has(m[1])) continue;
    const v = m[2].trim();
    sheet[m[1]] = v.startsWith('[') && v.endsWith(']') ? splitList(v.slice(1, -1)) : unquote(v);
  }
  return sheet;
}

const filled = (v) => typeof v === 'string' && v.trim() !== '';

export const isCriterionSheet = (sheet) => sheet?.etage === 'critere'
  && filled(sheet.critere) && filled(sheet.seuil) && filled(sheet.mesure);

// Every criterion sheet under dir, named by its posix path relative to dir.
export async function listReferenceFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    console.error(`[suggest] references folder not found: ${dir}`);
    return [];
  }
  const names = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !SKIPPED_FILES.test(e.name))
    .map((e) => join(e.parentPath ?? e.path, e.name).slice(dir.length).replace(/^[\\/]+/, '').split(/[\\/]/))
    .filter((parts) => !parts.some((p, i) => p.startsWith('.') || (i < parts.length - 1 && p === 'lecture')))
    .map((parts) => parts.join('/'))
    .sort();
  const files = await Promise.all(names.map(async (name) => ({ name, text: await readFile(join(dir, name), 'utf8') })));
  return files.filter((f) => isCriterionSheet(parseSheet(f.text)));
}
