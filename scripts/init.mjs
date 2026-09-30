// Interactive first-time setup: `npm run init`. Asks the few things that can't
// be guessed, checks each answer live, and writes .env from .env.example
// (keeping its comments and any value already in an existing .env).
import '../lib/node-check.mjs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, '.env');
const EXAMPLE = join(ROOT, '.env.example');

if (!process.stdin.isTTY) {
  console.error('npm run init is interactive: run it in a terminal, or copy .env.example to .env by hand.');
  process.exit(1);
}

const parseEnv = (text) => Object.fromEntries(
  text.split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const existing = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
const example = readFileSync(EXAMPLE, 'utf8');
const answers = {};

// Output goes through a stream we can mute, so the token isn't echoed while
// typed (readline's own _writeToOutput hook is not honoured on recent Node).
let muted = false;
const mutedOut = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output: mutedOut, terminal: true });
const ask = async (label, def = '', { secret = false } = {}) => {
  const hint = def ? ` [${secret ? '\u2022\u2022\u2022\u2022 (keep)' : def}]` : '';
  const answer = rl.question(`${label}${hint}: `);
  muted = secret; // the prompt is already written, hide what gets typed
  const v = (await answer).trim();
  muted = false;
  if (secret) console.log();
  return v || def;
};
const yes = async (label, def = true) => {
  const v = (await rl.question(`${label} [${def ? 'Y/n' : 'y/N'}] `)).trim().toLowerCase();
  return v ? v.startsWith('y') : def;
};
const pick = async (label, options, allowNone) => {
  options.forEach((o, i) => console.log(`  ${i + 1}) ${o}`));
  const v = (await rl.question(`${label}${allowNone ? ' (number, name, or empty for none)' : ' (number or name)'}: `)).trim();
  if (!v) return '';
  const n = Number(v);
  if (Number.isInteger(n) && options[n - 1]) return options[n - 1];
  return v.startsWith('/') ? v : `/${v}`;
};

console.log('\nMarginalia setup\n');

// --- GitLab ---
answers.GITLAB_BASE_URL = (await ask('GitLab URL', existing.GITLAB_BASE_URL || 'https://gitlab.com')).replace(/\/+$/, '');
answers.GITLAB_PROJECT_ID = await ask('Project (numeric id or group/project path)', existing.GITLAB_PROJECT_ID);
console.log('Token: personal access token with the "api" scope (GitLab > Preferences > Access tokens).');
for (;;) {
  answers.GITLAB_TOKEN = await ask('GitLab token', existing.GITLAB_TOKEN?.startsWith('glpat-x') ? '' : existing.GITLAB_TOKEN, { secret: true });
  try {
    const call = async (p) => {
      const res = await fetch(`${answers.GITLAB_BASE_URL}/api/v4${p}`, { headers: { 'PRIVATE-TOKEN': answers.GITLAB_TOKEN } });
      if (!res.ok) throw new Error(`${p} -> ${res.status}`);
      return res.json();
    };
    const me = await call('/user');
    const id = /^\d+$/.test(answers.GITLAB_PROJECT_ID) ? answers.GITLAB_PROJECT_ID : encodeURIComponent(answers.GITLAB_PROJECT_ID);
    const project = await call(`/projects/${id}`);
    answers.GITLAB_USERNAME = me.username;
    console.log(`  ✓ Logged in as ${me.username}, project ${project.path_with_namespace} reachable\n`);
    break;
  } catch (err) {
    console.log(`  ✗ ${err.message}`);
    if (!(await yes('Retry?'))) { console.log('Aborted, nothing written.'); rl.close(); process.exit(1); }
    answers.GITLAB_BASE_URL = (await ask('GitLab URL', answers.GITLAB_BASE_URL)).replace(/\/+$/, '');
    answers.GITLAB_PROJECT_ID = await ask('Project', answers.GITLAB_PROJECT_ID);
  }
}

// --- Repo ---
for (;;) {
  const p = (await ask('Path of your local checkout of that repo', existing.REPO_LOCAL_PATH || existing.WEBAPP_LOCAL_PATH)).replace(/^~/, homedir());
  try {
    execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: p, stdio: 'ignore' });
    answers.REPO_LOCAL_PATH = p;
    console.log('  ✓ git repository with an origin remote\n');
    break;
  } catch {
    console.log('  ✗ not a git repository with an "origin" remote');
  }
}

// --- Commands ---
const listCommands = (dir) => {
  try { return readdirSync(join(dir, 'commands')).filter((f) => f.endsWith('.md')).map((f) => `/${basename(f, '.md')}`); } catch { return []; }
};
const repoClaude = join(answers.REPO_LOCAL_PATH, '.claude');
let found = [...new Set([...listCommands(repoClaude), ...listCommands(join(homedir(), '.claude'))])].sort();
if (!found.length) {
  console.log('No slash commands found in the repo\'s .claude/ or ~/.claude/.');
  if (await yes(`Copy the starter commands and agent from examples/ into ${repoClaude}?`)) {
    for (const sub of ['commands', 'agents']) {
      mkdirSync(join(repoClaude, sub), { recursive: true });
      for (const f of readdirSync(join(ROOT, 'examples', sub))) copyFileSync(join(ROOT, 'examples', sub, f), join(repoClaude, sub, f));
    }
    found = ['/review', '/triage'];
    console.log('  ✓ copied (edit them to fit your team)\n');
  }
}
console.log('Which command should review other people\'s MRs?');
answers.REVIEW_COMMAND = (await pick('Review command', found, false)) || existing.REVIEW_COMMAND || '/review';
console.log('\nWhich command should triage reviewer comments on YOUR MRs? (none = your own MRs are ignored)');
answers.TRIAGE_COMMAND = await pick('Triage command', found, true);

// --- Behaviour ---
answers.ALLOWED_TARGET_BRANCHES = await ask('\nOnly review MRs targeting these branches (comma-separated, empty = all)', existing.ALLOWED_TARGET_BRANCHES ?? '');
answers.BOT_WORKTREE_DIR = existing.BOT_WORKTREE_DIR || join(ROOT, 'worktree');
answers.CLAUDE_BIN = existing.CLAUDE_BIN || 'claude';

// --- Write .env ---
const values = { ...existing, ...answers };
delete values.WEBAPP_LOCAL_PATH;
const out = example.split('\n').map((line) => {
  const m = line.match(/^([A-Z_]+)=/);
  return m && m[1] in values ? `${m[1]}=${values[m[1]]}` : line;
}).join('\n');
if (existsSync(ENV_FILE)) writeFileSync(`${ENV_FILE}.bak`, readFileSync(ENV_FILE));
writeFileSync(ENV_FILE, out, { mode: 0o600 });
console.log(`\n✓ ${ENV_FILE} written${existsSync(`${ENV_FILE}.bak`) ? ' (previous one saved as .env.bak)' : ''}\n`);

const runDoctor = await yes('Run the checks now (npm run doctor)?');
rl.close();
if (runDoctor) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'doctor.mjs')], { stdio: 'inherit' });
  if (r.status === 0) console.log('\nReady: npm start (or `npm run doctor -- --dry-run <iid>` to try one MR first).');
}
