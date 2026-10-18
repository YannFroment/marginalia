import { test } from 'node:test';
import assert from 'node:assert/strict';

const { lawSlugs, lawMarkdown } = await import('../scripts/fetch-laws-of-ux.mjs');

test('the law pages are the site links that are not languages, pages or files', () => {
  const home = '<a href=https://lawsofux.com/some-law/>x</a><a href="https://lawsofux.com/other-law/">y</a>'
    + '<a href=https://lawsofux.com/fr/>fr</a><a href=https://lawsofux.com/info/>i</a>'
    + '<link href=https://lawsofux.com/css/app.min.css><a href=https://lawsofux.com/index.xml>r</a><a href=https://lawsofux.com/some-law/>again</a>';
  assert.deepEqual(lawSlugs(home), ['some-law', 'other-law']);
});

test('a law page becomes a reference with its source, licence, summary and takeaways', () => {
  const page = '<h1 class=t>Some Law</h1><div class=text-lrg>One line &amp; a half.</div>'
    + '<section><h2>Takeaways</h2><ol class="grid"><li class=grid__item>First.</li><li class=grid__item>Second.</li></ol></section>';
  const md = lawMarkdown('some-law', page);
  assert.match(md, /^<!-- Source: https:\/\/lawsofux\.com\/some-law\/ .*CC BY-NC-ND 4\.0/);
  assert.match(md, /^# Some Law$/m);
  assert.match(md, /^> One line & a half\.$/m);
  assert.match(md, /^- First\.\n- Second\.$/m);
});
