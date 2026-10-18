import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

// A handful of languages instead of highlight.js's whole "common" set: reviews quote
// TypeScript, config and shell, and rarely anything else (unknown fences stay plain).
export const HIGHLIGHT = {
  detect: false,
  languages: { bash, css, diff, javascript, json, typescript, xml, yaml },
  aliases: { bash: ['sh', 'shell', 'zsh'], javascript: ['js', 'jsx', 'mjs'], typescript: ['ts', 'tsx'], xml: ['html', 'svg'], yaml: ['yml'] },
};
