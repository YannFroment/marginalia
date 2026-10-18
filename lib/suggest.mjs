// Suggested tickets: a model reads one area of the repo against the references
// and drafts tickets with the template; they wait in suggestions.json until you
// post or dismiss them. Nothing here writes to Jira (suggest-post.mjs does, on click).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { CLAUDE_BIN, REPO_LOCAL_PATH } from './config.mjs';
import { claudeEnv } from './claude-cli.mjs';
import { execFileAsync } from './exec.mjs';
import { fileExists } from './paths.mjs';
import { TICKETS_FILE } from './tickets-config.mjs';
import {
  SUGGESTIONS_FILE, SUGGEST_WORKTREE_DIR, SUGGEST_REFERENCES_DIR, suggestTemplateFile, SUGGEST_FOCUS,
  SUGGEST_COUNT, SUGGEST_MODEL, SUGGEST_VERIFY_MODEL, SUGGEST_JIRA_PROJECT, suggestAreas,
} from './suggest-config.mjs';
import { digestReference, buildPrompt, parseSuggestions, nextArea, buildVerifyPrompt, parseVerdict } from './suggest-prompt.mjs';

const RUN_TIMEOUT_MS = 30 * 60_000;

let running = null;

// `running` is this process's run, never read back from the file: a run cut
// short by a restart must not leave the button stuck.
export async function readSuggestions() {
  let data = { lastRun: null, items: [] };
  try {
    data = JSON.parse(await readFile(SUGGESTIONS_FILE, 'utf8'));
  } catch {
    /* no run yet */
  }
  return { ...data, running: Boolean(running) };
}

// Every change goes through this queue: a run that ends while you post must not
// write back a list read before your post.
let queue = Promise.resolve();
export function updateSuggestions(change) {
  const next = queue.then(async () => {
    const { running: _running, ...data } = change(await readSuggestions());
    await writeFile(`${SUGGESTIONS_FILE}.tmp`, JSON.stringify(data, null, 1));
    await rename(`${SUGGESTIONS_FILE}.tmp`, SUGGESTIONS_FILE);
    return data;
  });
  queue = next.catch(() => {});
  return next;
}

// A detached checkout of the remote's default branch, refreshed before each run,
// so suggestions read the code as it is shared, not your local work.
async function freshWorktree() {
  if (!(await fileExists(SUGGEST_WORKTREE_DIR))) {
    await execFileAsync('git', ['worktree', 'add', '--detach', SUGGEST_WORKTREE_DIR], { cwd: REPO_LOCAL_PATH });
  }
  const { stdout } = await execFileAsync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: REPO_LOCAL_PATH }).catch(() => ({ stdout: 'origin/main' }));
  const branch = stdout.trim().replace(/^origin\//, '');
  await execFileAsync('git', ['fetch', '--quiet', 'origin', branch], { cwd: SUGGEST_WORKTREE_DIR });
  await execFileAsync('git', ['checkout', '--quiet', '--detach', '--force', 'FETCH_HEAD'], { cwd: SUGGEST_WORKTREE_DIR });
  const { stdout: sha } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: SUGGEST_WORKTREE_DIR });
  return { branch, sha: sha.trim() };
}

async function references() {
  if (!SUGGEST_REFERENCES_DIR) return [];
  const names = (await readdir(SUGGEST_REFERENCES_DIR)).filter((n) => n.endsWith('.md') && !/^(index|info|book)\.md$/.test(n)).sort();
  return Promise.all(names.map(async (n) => digestReference(n, await readFile(join(SUGGEST_REFERENCES_DIR, n), 'utf8'))));
}

async function openTicketTitles() {
  try {
    const { tickets } = JSON.parse(await readFile(TICKETS_FILE, 'utf8'));
    return tickets.filter((t) => t.project === SUGGEST_JIRA_PROJECT).map((t) => `${t.key} ${t.summary}`);
  } catch {
    return [];
  }
}

function ask(prompt, model = SUGGEST_MODEL) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--model', model, '--output-format', 'json', '--setting-sources', '',
      '--tools', 'Read,Grep,Glob', '--allowedTools', 'Read', 'Grep', 'Glob'];
    const child = spawn(CLAUDE_BIN, args, { cwd: SUGGEST_WORKTREE_DIR, env: claudeEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), RUN_TIMEOUT_MS);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out);
        resolve({ text: res.result ?? '', costUsd: res.total_cost_usd ?? 0 });
      } catch {
        reject(new Error(`suggestion run exited ${code}`));
      }
    });
  });
}

// One run: the next area, read by the model, its drafts added to the list.
// A second click while a run is going joins it instead of starting another.
export function findSuggestions() {
  running ??= (async () => {
    const data = await readSuggestions();
    const area = nextArea(suggestAreas, data.lastRun?.area);
    const started = new Date().toISOString();
    try {
      const [{ sha }, refs, template, open] = await Promise.all([
        freshWorktree(), references(), readFile(suggestTemplateFile, 'utf8').catch(() => ''), openTicketTitles(),
      ]);
      const previous = data.items.map((s) => s.title);
      const prompt = buildPrompt({ focus: SUGGEST_FOCUS, area, count: Number(SUGGEST_COUNT), references: refs, template, openTickets: open, previous });
      const { text, costUsd } = await ask(prompt);
      const drafts = parseSuggestions(text);
      // Each draft is re-read against the code by another run: a false claim is shown, never posted blind.
      const checks = SUGGEST_VERIFY_MODEL
        ? await Promise.all(drafts.map((d) => ask(buildVerifyPrompt(d), SUGGEST_VERIFY_MODEL).catch((err) => ({ text: '', costUsd: 0, err }))))
        : [];
      const spent = costUsd + checks.reduce((sum, c) => sum + c.costUsd, 0);
      const found = drafts.map((d, i) => ({
        id: randomUUID(), at: started, area, sha, ...d, status: 'new',
        ...(SUGGEST_VERIFY_MODEL ? { check: parseVerdict(checks[i].text) } : {}),
      }));
      await updateSuggestions((latest) => ({ ...latest, lastRun: { at: started, area, sha, costUsd: spent, found: found.length }, items: [...found, ...latest.items] }));
      return found;
    } catch (err) {
      await updateSuggestions((latest) => ({ ...latest, lastRun: { at: started, area, error: err.message } }));
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}
