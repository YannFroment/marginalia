import { test } from 'node:test';
import assert from 'node:assert/strict';

const { markdownToAdf, inline } = await import('../lib/adf.mjs');
const { digestReference, buildPrompt, parseSuggestions, nextArea, buildVerifyPrompt, parseVerdict, metricsFor } = await import('../lib/suggest-prompt.mjs');

const body = `## Context

:::warning
**The filter resets on back navigation.**

Users lose their choices.
:::

---

## User Story

:::note
**As a** traveller,
**I need** my filters kept,
**So that** I do not redo them.
:::

| # | Given | When | Then |
|---|---|---|---|
| **AC1** | filters set | I go back | they are still set |

- one \`code\`
- two`;

test('a ticket body becomes ADF with panels, rules, tables and lists', () => {
  const doc = markdownToAdf(body);
  assert.equal(doc.type, 'doc');
  assert.deepEqual(doc.content.map((n) => n.type), ['heading', 'panel', 'rule', 'heading', 'panel', 'table', 'bulletList']);
  const [, warning, , , note, table, list] = doc.content;
  assert.equal(warning.attrs.panelType, 'warning');
  assert.deepEqual(warning.content.map((n) => n.type), ['paragraph', 'paragraph']);
  assert.deepEqual(warning.content[0].content[0].marks, [{ type: 'strong' }]);
  // The user story's three lines stay in one paragraph, separated by hard breaks.
  assert.equal(note.content.length, 1);
  assert.equal(note.content[0].content.filter((n) => n.type === 'hardBreak').length, 2);
  assert.equal(table.content.length, 2);
  assert.equal(table.content[0].content[0].type, 'tableHeader');
  assert.equal(table.content[1].content[3].content[0].content[0].text, 'they are still set');
  assert.deepEqual(list.content[0].content[0].content[1], { type: 'text', text: 'code', marks: [{ type: 'code' }] });
});

test('inline marks: bold, italic, code and links, plain text untouched', () => {
  assert.deepEqual(inline('a **b** *c* `d` [e](https://x.io)').map((n) => [n.text, (n.marks ?? []).map((m) => m.type).join()]), [
    ['a ', ''], ['b', 'strong'], [' ', ''], ['c', 'em'], [' ', ''], ['d', 'code'], [' ', ''], ['e', 'link'],
  ]);
  assert.deepEqual(inline('2 * 3 and snake_case_name'), [{ type: 'text', text: '2 * 3 and snake_case_name' }]);
  assert.deepEqual(inline('**see `a.ts`**')[1], { type: 'text', text: 'a.ts', marks: [{ type: 'code' }] });
});

test('a table written inside a panel moves out of it, as Jira requires', () => {
  const doc = markdownToAdf(':::note\nText\n\n| a | b |\n|---|---|\n| 1 | 2 |\n:::');
  assert.deepEqual(doc.content.map((n) => n.type), ['panel', 'table']);
  assert.deepEqual(doc.content[0].content.map((n) => n.type), ['paragraph']);
});

test('a fenced block is code, its content kept as is', () => {
  const [code] = markdownToAdf('```ts\nconst a = **b**;\n```').content;
  assert.deepEqual(code, { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = **b**;' }] });
});

test('a reference is cut to its title, quote and takeaways', () => {
  const text = '---\ntitre: x\n---\n\n# Hick’s Law\n\n> "Time grows with choices."\n\n## Takeaways\n\n- Fewer choices.\n\n## Origins\n\nLong story.';
  const digest = digestReference('hicks-law.md', text);
  assert.match(digest, /^### Hick’s Law \(hicks-law\.md\)/);
  assert.match(digest, /Fewer choices/);
  assert.doesNotMatch(digest, /Long story/);
});

test('the prompt carries the area, the references, the template and what not to repeat', () => {
  const prompt = buildPrompt({ focus: 'UX', area: 'src/app/features/cart', count: 3, references: ['### Hick'], template: 'TEMPLATE', openTickets: ['ABC-1 Fix cart'], previous: ['Old idea'] });
  for (const part of ['src/app/features/cart', 'at most 3', '### Hick', 'TEMPLATE', 'ABC-1 Fix cart', 'Old idea', '"body"']) assert.ok(prompt.includes(part), part);
});

const promptArgs = { focus: 'UX', area: 'src/app/features/trip', count: 2, references: ['### Hick'], template: 'TEMPLATE', openTickets: ['ABC-1 Fix cart'], previous: ['Old idea'] };
const page = { pathname: '/x', days: 30, pageviews: 1, users: 1, rageClicks: 2, rageUsers: 1, topRageElement: 'button.cta', lcp75: 2968, inp75: 112, cls75: 0.37 };

test('the prompt carries the live measurements of the area, one line per page', () => {
  const prompt = buildPrompt({ ...promptArgs, metrics: [page, { ...page, pathname: '/y', topRageElement: null, lcp75: null }] });
  assert.ok(prompt.includes('## Measured on the live site (PostHog, last 30 days)'));
  assert.ok(prompt.includes('- /x: 1 views, 2 rage clicks (1 users), top element: button.cta, LCP p75 2968 ms, INP p75 112 ms, CLS p75 0.37'));
  assert.ok(prompt.includes('- /y: 1 views, 2 rage clicks (1 users), top element: none, LCP p75 n/a ms, INP p75 112 ms, CLS p75 0.37'));
  assert.ok(prompt.includes('A suggestion on one of these pages names the measurement it would move.'));
  assert.ok(prompt.indexOf('Measured on the live site') < prompt.indexOf('## Answer'));
});

test('without measurements the prompt is the one written before them', () => {
  assert.equal(buildPrompt({ ...promptArgs, metrics: [] }), buildPrompt(promptArgs));
  assert.ok(!buildPrompt(promptArgs).includes('Measured on the live site'));
});

test('the measurements of the current area are picked from the factory file', () => {
  const file = { at: '2026-10-22T10:00:00Z', days: 30, areas: { 'src/app/features/trip': [page] } };
  assert.deepEqual(metricsFor(file, 'src/app/features/trip'), [page]);
  assert.deepEqual(metricsFor(file, 'src/app/features/home'), []);
  assert.deepEqual(metricsFor(file, ''), []);
  assert.deepEqual(metricsFor(null, 'src/app/features/trip'), []);
  assert.deepEqual(metricsFor({ areas: { a: 'not a list' } }, 'a'), []);
});

test('suggestions are read from the answer, malformed ones dropped', () => {
  const answer = 'Here:\n[{"title":"[FE] Cart: keep filters","principle":"Jakob","files":["a.tsx:3",4],"why":"w","body":"## Context"},{"title":"","body":"x"},{"title":"no body"}]';
  const found = parseSuggestions(answer);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].files, ['a.tsx:3']);
  const long = parseSuggestions(JSON.stringify([{ title: 'T', body: 'B', principle: 'p'.repeat(150) }]));
  assert.equal(long[0].principle.length, 150, 'a principle names the sheet and its threshold: kept whole up to 200 chars');
  assert.deepEqual(parseSuggestions('no json here'), []);
  assert.deepEqual(parseSuggestions('[not json]'), []);
});

test('areas are scanned in turn', () => {
  assert.equal(nextArea([], 'x'), '');
  assert.equal(nextArea(['a', 'b'], undefined), 'a');
  assert.equal(nextArea(['a', 'b'], 'a'), 'b');
  assert.equal(nextArea(['a', 'b'], 'b'), 'a');
});

test('the check run gets the draft and its files, and its verdict is read strictly', () => {
  const prompt = buildVerifyPrompt({ title: 'T', body: 'B', files: ['a.tsx:3'] });
  for (const part of ['a.tsx:3', '## Title', 'T', '## Body', '"ok"']) assert.ok(prompt.includes(part), part);
  assert.deepEqual(parseVerdict('{"ok": true, "problems": []}'), { ok: true, problems: [] });
  assert.equal(parseVerdict('{"ok": true, "problems": ["line 3 is 30px"]}').ok, false);
  const long = parseVerdict(JSON.stringify({ ok: false, problems: ['x'.repeat(1000)] }));
  assert.equal(long.problems[0].length, 1000, 'a problem is a quoted sentence and its rebuttal: kept whole up to 1200 chars');
  assert.deepEqual(parseVerdict('sorry'), { ok: false, problems: ['the verification answer could not be read'] });
});

test('the example template is used when SUGGEST_TEMPLATE_FILE is empty', async () => {
  process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
  // Set before the import: dotenv never overrides it with a local .env value.
  process.env.SUGGEST_TEMPLATE_FILE = '';
  const { suggestTemplateFile } = await import('../lib/suggest-config.mjs');
  assert.match(suggestTemplateFile, /examples\/ticket-template\.md$/);
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(suggestTemplateFile, 'utf8'), /## Acceptance Criteria/);
});

const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { parseSheet, listReferenceFiles, isCriterionSheet } = await import('../lib/reference-sheet.mjs');

const sheet = (extra = '') => `---
titre: "CLS sous \\"0,1\\""
etage: "critere"
critere: "Le décalage reste faible."
seuil: "CLS ≤ 0,1"
mesure: "posthog"
principes: [mesurer-sur-le-terrain, suivre, "a, b"]
inconnue: "ignorée"
${extra}---
## En clair
corps
`;

test('parseSheet reads quoted strings, escapes and lists, and ignores other keys', () => {
  const s = parseSheet(sheet());
  assert.equal(s.titre, 'CLS sous "0,1"');
  assert.equal(s.etage, 'critere');
  assert.deepEqual(s.principes, ['mesurer-sur-le-terrain', 'suivre', 'a, b']);
  assert.equal('inconnue' in s, false);
  assert.equal(parseSheet('# no frontmatter'), null);
});

test('digestReference of a criterion sheet gives title, criterion, threshold, measure and principles', () => {
  const d = digestReference('ux/x/cls.md', sheet());
  assert.equal(d, '### CLS sous "0,1" (ux/x/cls.md)\ncritère : Le décalage reste faible.\nseuil : CLS ≤ 0,1\nmesure : posthog\nprincipes : mesurer-sur-le-terrain, suivre, a, b');
});

test('digestReference of a legacy sheet keeps title, quote and takeaways', () => {
  const legacy = '---\ntitre: "Law"\nsource: x\ntags: [ux]\n---\n\n# Law\n\n> "A quote."\n\n## Takeaways\n\n- one\n- two\n';
  assert.equal(digestReference('law.md', legacy), '### Law (law.md)\n"A quote."\n- one\n- two');
});

test('a criterion sheet needs a non-empty criterion, threshold and measure, as in the factory', () => {
  const full = { etage: 'critere', critere: 'c', seuil: 's', mesure: 'axe' };
  assert.equal(isCriterionSheet(full), true);
  assert.equal(isCriterionSheet({ ...full, seuil: '' }), false);
  assert.equal(isCriterionSheet({ ...full, seuil: '  ' }), false);
  assert.equal(isCriterionSheet({ ...full, critere: '' }), false);
  assert.equal(isCriterionSheet(parseSheet(sheet().replace('seuil: "CLS ≤ 0,1"', 'seuil: ""').replace('mesure: "posthog"', 'mesure: "axe"'))), false);
});

test('listReferenceFiles keeps only criterion sheets with a measure, recursively', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'refs-'));
  const put = async (p, t) => { await mkdir(join(dir, p, '..'), { recursive: true }); await writeFile(join(dir, p), t); };
  await put('ux/x/cls.md', sheet());
  await put('ux/x/no-measure.md', sheet().replace('mesure: "posthog"', 'mesure: ""'));
  await put('ux/x/no-threshold.md', sheet().replace('seuil: "CLS ≤ 0,1"', 'seuil: ""'));
  await put('ux/x/principe.md', '---\ntitre: "P"\netage: "principe"\n---\nx');
  await put('ux/laws/law.md', '---\ntitre: "Law"\ntags: [ux]\n---\n# Law');
  await put('lecture/y.md', sheet());
  await put('.hidden/z.md', sheet());
  await put('sources.md', sheet());
  await put('README.md', sheet());
  await put('ux/index.md', sheet());
  await put('a/b.md', sheet());
  const files = await listReferenceFiles(dir);
  assert.deepEqual(files.map((f) => f.name), ['a/b.md', 'ux/x/cls.md']);
  assert.match(files[0].text, /etage: "critere"/);
});

test('the prompt asks to judge against criteria and name criterion, threshold and principle', () => {
  const p = buildPrompt({ focus: 'f', area: '', count: 1, references: ['### R'], template: '', openTickets: [], previous: [] });
  assert.match(p, /Judge the interface against these criteria; each suggestion names the criterion it fails, its threshold and the principle behind it\./);
});

test('listReferenceFiles logs and returns nothing for a folder that does not exist', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'refs-'));
  const logged = t.mock.method(console, 'error', () => {});
  assert.deepEqual(await listReferenceFiles(join(dir, 'missing')), []);
  assert.deepEqual(logged.mock.calls.map((c) => c.arguments[0]), [`[suggest] references folder not found: ${join(dir, 'missing')}`]);
});

test('listReferenceFiles rejects when the path is not a folder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'refs-'));
  await writeFile(join(dir, 'file.md'), 'x');
  await assert.rejects(listReferenceFiles(join(dir, 'file.md')), { code: 'ENOTDIR' });
});
