// Read-only preflight: `npm run doctor`, or `npm run doctor -- --dry-run <iid>`
// to run the real review chain on one MR and write the result to a temp file.
import '../lib/node-check.mjs';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const cfg = await import('../lib/config.mjs');
const run = promisify(execFile);
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const warnMsg = (m) => console.log(`  ! ${m}`);
const bad = (m, fix) => { failures += 1; console.log(`  ✗ ${m}${fix ? `\n      -> ${fix}` : ''}`); };
const step = async (name, fn) => {
  try { await fn(); } catch (err) { bad(`${name}: ${err.message.split('\n')[0]}`); }
};

console.log('marginalia doctor\n');

console.log('Environment');
Number(process.versions.node.split('.')[0]) >= 18 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node}`, 'Node 18+ required');
if (!existsSync(join(cfg.ROOT, '.env'))) bad('.env missing', 'cp .env.example .env and fill it in');
const missing = cfg.missingConfig();
missing.length ? bad(`Missing in .env: ${missing.join(', ')}`) : ok('Required .env values present');
existsSync(join(cfg.ROOT, 'studio', 'dist')) ? ok('Studio built') : warnMsg('Studio not built (http://localhost shows 503): npm run setup');

console.log('\nClaude');
await step('claude CLI', async () => {
  const { stdout } = await run(cfg.CLAUDE_BIN, ['--version']);
  ok(`${cfg.CLAUDE_BIN} ${stdout.trim()}`);
});
if (process.env.ANTHROPIC_API_KEY) warnMsg('ANTHROPIC_API_KEY is set: the bot strips it for its runs, so you must be logged into claude.ai (`claude` then /login)');

console.log('\nGitLab');
if (!missing.length) {
  const { gitlabRequest } = await import('../lib/gitlab.mjs');
  await step('GitLab token', async () => {
    const me = await gitlabRequest('/user');
    me.username === cfg.GITLAB_USERNAME ? ok(`Token belongs to ${me.username}`) : bad(`Token belongs to "${me.username}" but GITLAB_USERNAME is "${cfg.GITLAB_USERNAME}"`);
  });
  await step('GitLab project', async () => {
    const p = await gitlabRequest(`/projects/${cfg.encodedProjectId}`);
    ok(`Project ${p.path_with_namespace} reachable`);
  });
}

console.log('\nRepository and commands');
if (cfg.REPO_LOCAL_PATH) {
  await step('REPO_LOCAL_PATH', async () => {
    await run('git', ['rev-parse', '--git-dir'], { cwd: cfg.REPO_LOCAL_PATH });
    ok(`${cfg.REPO_LOCAL_PATH} is a git repository`);
    const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd: cfg.REPO_LOCAL_PATH });
    ok(`origin = ${stdout.trim()}`);
  });
  const dirs = [join(cfg.REPO_LOCAL_PATH, '.claude'), join(homedir(), '.claude')];
  const findCommand = (cmd) => dirs.some((d) => existsSync(join(d, 'commands', `${cmd.replace(/^\//, '')}.md`)) || existsSync(join(d, 'skills', cmd.replace(/^\//, ''), 'SKILL.md')));
  for (const [label, cmd] of [['REVIEW_COMMAND', cfg.REVIEW_COMMAND], ['TRIAGE_COMMAND', cfg.TRIAGE_COMMAND], ['DEEPEN_COMMAND', cfg.DEEPEN_COMMAND]]) {
    if (!cmd && label === 'DEEPEN_COMMAND') continue;
    if (!cmd) { label === 'TRIAGE_COMMAND' ? warnMsg('TRIAGE_COMMAND empty: your own MRs are ignored') : bad('REVIEW_COMMAND is empty'); continue; }
    findCommand(cmd) ? ok(`${label} ${cmd} found`) : bad(`${label} ${cmd} not found in <repo>/.claude or ~/.claude`, 'copy one from examples/commands or fix the name (plugin commands are not detected here: use --dry-run)');
  }
}

console.log('\nOptional (macOS)');
for (const bin of ['terminal-notifier']) {
  await run('which', [bin]).then(() => ok(bin), () => warnMsg(`${bin} missing: notifications are not clickable (brew install ${bin})`));
}

const dryIdx = process.argv.indexOf('--dry-run');
if (dryIdx !== -1 && !failures) {
  const iid = process.argv[dryIdx + 1];
  console.log(`\nDry run on MR !${iid}`);
  const { gitlabRequest } = await import('../lib/gitlab.mjs');
  const { ensureBotWorktree } = await import('../lib/worktree.mjs');
  const { runReview } = await import('../lib/claude-runner.mjs');
  await step('dry run', async () => {
    const mr = await gitlabRequest(`/projects/${cfg.encodedProjectId}/merge_requests/${iid}`);
    await ensureBotWorktree();
    const out = join(tmpdir(), `marginalia-dry-run-${iid}.md`);
    const outcome = await runReview(mr, out);
    outcome === 'reviewed' ? ok(`Report written to ${out} (see the log line above for which source was used)`) : bad(`Skipped: ${outcome}`);
  });
}

console.log(failures ? `\n${failures} problem(s) to fix.` : '\nAll good.');
process.exit(failures ? 1 : 0);
