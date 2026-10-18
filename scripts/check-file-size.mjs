#!/usr/bin/env node
// Keeps every module of lib/ under MAX_LINES, so each one stays small enough to
// read in one go and to test on its own. Split a module that grows past it.
//
//   node scripts/check-file-size.mjs          checks all of lib/, exits 1 on any excess
//   node scripts/check-file-size.mjs --hook   Claude Code PostToolUse hook: reads the
//                                             hook's JSON on stdin, checks the edited
//                                             file only, exits 2 so Claude sees why
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINES = 150;
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

export const countLines = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

// lib/foo.mjs, also inside a worktree of this repo (.claude/worktrees/<name>/lib/foo.mjs).
export function isGuarded(path, root = ROOT) {
  const rel = relative(root, path).split(sep).join('/').replace(/^\.claude\/worktrees\/[^/]+\//, '');
  return /^lib\/.+\.mjs$/.test(rel);
}

export function oversized(root = ROOT) {
  return readdirSync(join(root, 'lib'), { recursive: true })
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => ({ file: `lib/${f}`, lines: countLines(readFileSync(join(root, 'lib', f), 'utf8')) }))
    .filter(({ lines }) => lines > MAX_LINES);
}

const advice = `Split it into focused modules (pure logic apart from I/O, so it can be unit-tested) instead of compacting the code.`;

function runHook() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const path = input.tool_input?.file_path;
  if (!path || !isGuarded(path, input.cwd ?? ROOT)) return 0;
  let lines;
  try {
    lines = countLines(readFileSync(path, 'utf8'));
  } catch {
    return 0;
  }
  if (lines <= MAX_LINES) return 0;
  console.error(`${path} has ${lines} lines, over the ${MAX_LINES}-line limit for lib/ modules. ${advice}`);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--hook')) process.exit(runHook());
  const over = oversized();
  for (const { file, lines } of over) console.error(`${file}: ${lines} lines (max ${MAX_LINES})`);
  if (over.length) console.error(advice);
  process.exit(over.length ? 1 : 0);
}
