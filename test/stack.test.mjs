import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStacks, layersAbove, stackPrompt, parseAcrossLayers } from '../lib/stack.mjs';

const mr = (iid, source, target) => ({ iid, title: `MR ${iid}`, source_branch: source, target_branch: target });
const chain = [mr(3, 'c', 'b'), mr(1, 'a', 'main'), mr(2, 'b', 'a'), mr(9, 'solo', 'main')];

test('chain is ordered bottom to top whatever the list order', () => {
  const s = analyzeStacks(chain);
  assert.deepEqual(s.get(1), { ...s.get(1), position: 1, size: 3, parentIid: null, childIids: [2], baseBranch: 'main', id: 'a' });
  assert.equal(s.get(2).parentIid, 1);
  assert.equal(s.get(3).position, 3);
  assert.deepEqual(s.get(3).layers.map((l) => l.iid), [1, 2, 3]);
});

test('a lone MR is a stack of one on its own target', () => {
  const s = analyzeStacks(chain).get(9);
  assert.equal(s.size, 1);
  assert.equal(s.baseBranch, 'main');
});

test('layersAbove lists the layers built on top, nearest first', () => {
  const s = analyzeStacks(chain);
  assert.deepEqual(layersAbove(s, 1), [2, 3]);
  assert.deepEqual(layersAbove(s, 3), []);
});

test('branches targeting each other do not loop forever', () => {
  const s = analyzeStacks([mr(1, 'a', 'b'), mr(2, 'b', 'a')]);
  assert.equal(s.size, 2);
});

test('prompt names the layer, upper refs and the contract', () => {
  const s = analyzeStacks(chain);
  const p = stackPrompt(chain[2], s.get(3), { upperRefs: {}, reviewPaths: { 1: '/r/a.md' } });
  assert.match(p, /layer 3 of 3/);
  assert.match(p, /review: \/r\/a\.md/);
  const q = stackPrompt(chain[1], s.get(1), { upperRefs: { 2: 'refs/marginalia/stack/2' } });
  assert.match(q, /git diff HEAD\.\.\.refs\/marginalia\/stack\/2/);
  assert.match(q, /### Across layers/);
});

test('parseAcrossLayers reads bullets of that section only', () => {
  const md = [
    '### Critical',
    '- [settled-later !5] not here',
    '### Across layers',
    '- [belongs-lower !12] `a.ts:3` wrong type',
    '- [settled-later !14]   unused export',
    '- None',
    '### Suggestions',
    '- [assumes-upper !15] not here either',
  ].join('\n');
  assert.deepEqual(parseAcrossLayers(md), [
    { kind: 'belongs-lower', iid: 12, text: '`a.ts:3` wrong type' },
    { kind: 'settled-later', iid: 14, text: 'unused export' },
  ]);
});
