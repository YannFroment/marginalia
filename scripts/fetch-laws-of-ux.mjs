#!/usr/bin/env node
// Downloads the laws of https://lawsofux.com/ (Jon Yablonski) into a folder of
// markdown references, one file per law, for SUGGEST_REFERENCES_DIR. An example
// set of references: any folder of markdown principles works the same way.
//
//   node scripts/fetch-laws-of-ux.mjs <folder>
//
// The site is licensed CC BY-NC-ND 4.0, so the text is fetched to your machine,
// kept as published (title, summary, takeaways), with its source and licence on
// top of each file; nothing of it is stored in this repo.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://lawsofux.com/';
const NOT_LAWS = new Set(['ar', 'es', 'fa', 'fr', 'contact', 'privacy', 'info', 'articles', 'book', 'cards']);
const LICENCE = 'CC BY-NC-ND 4.0, https://creativecommons.org/licenses/by-nc-nd/4.0/';

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// The law pages linked from the home page, as slugs.
export function lawSlugs(home) {
  const slugs = [...home.matchAll(/href="?https:\/\/lawsofux\.com\/([^/"\s>]+)\/(?=["\s>])/g)].map((m) => decodeURIComponent(m[1]));
  return [...new Set(slugs)].filter((s) => !NOT_LAWS.has(s) && !s.includes('.'));
}

// One law page to a reference file: title, one-line summary, takeaways.
export function lawMarkdown(slug, page) {
  const title = text(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? slug);
  const summary = text(page.match(/class="?text-lrg"?[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '');
  const list = page.match(/<h2>Takeaways<\/h2>\s*<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? '';
  const takeaways = [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => `- ${text(m[1])}`);
  return [
    `<!-- Source: ${SITE}${encodeURI(slug)}/ (Jon Yablonski), licence ${LICENCE} -->`,
    `# ${title}`, '', `> ${summary}`, '', '## Takeaways', '', ...takeaways, '',
  ].join('\n');
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/fetch-laws-of-ux.mjs <folder>');
    process.exit(1);
  }
  await mkdir(dir, { recursive: true });
  const slugs = lawSlugs(await get(SITE));
  for (const slug of slugs) {
    await writeFile(join(dir, `${slug}.md`), lawMarkdown(slug, await get(`${SITE}${encodeURI(slug)}/`)));
  }
  console.log(`${slugs.length} laws written to ${dir}. Set SUGGEST_REFERENCES_DIR=${dir} in .env.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
