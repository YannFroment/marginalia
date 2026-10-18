import { test } from 'node:test';
import assert from 'node:assert/strict';

const { markdownToAdf, inline } = await import('../lib/adf.mjs');
const { digestReference, buildPrompt, parseSuggestions, nextArea, buildVerifyPrompt, parseVerdict } = await import('../lib/suggest-prompt.mjs');

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

test('suggestions are read from the answer, malformed ones dropped', () => {
  const answer = 'Here:\n[{"title":"[FE] Cart: keep filters","principle":"Jakob","files":["a.tsx:3",4],"why":"w","body":"## Context"},{"title":"","body":"x"},{"title":"no body"}]';
  const found = parseSuggestions(answer);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].files, ['a.tsx:3']);
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
