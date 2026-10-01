import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeQaSection } from '../lib/qa-section.mjs';

test('the QA section is appended to the review', () => {
  assert.equal(mergeQaSection('# Review\n**Verdict:** APPROVE\n', '## QA\n- tried X : it held'), '# Review\n**Verdict:** APPROVE\n\n## QA\n\n- tried X : it held\n');
});

test('a new QA run replaces the previous section', () => {
  const once = mergeQaSection('# Review\n', '## QA\nold run');
  assert.equal(mergeQaSection(once, '## QA\nnew run'), '# Review\n\n## QA\n\nnew run\n');
});

test('a report without its heading still lands under ## QA', () => {
  assert.equal(mergeQaSection('# Review', '- tried Y : it broke'), '# Review\n\n## QA\n\n- tried Y : it broke\n');
});
