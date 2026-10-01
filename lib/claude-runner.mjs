import { writeFile } from 'node:fs/promises';
import { execFileAsync } from './exec.mjs';
import { c, log, warn } from './log.mjs';
import {
  BOT_WORKTREE_DIR, CLAUDE_BIN, CLAUDE_ALLOWED_TOOLS, CLAUDE_MR_COMMENTS_ALLOWED_TOOLS,
  REVIEW_COMMAND, TRIAGE_COMMAND, REVIEW_PROMPT_EXTRA,
} from './config.mjs';
import { branchCheckedOutElsewhere, checkoutMergeRequest } from './worktree.mjs';
import { reviewOutputPath, mrCommentsOutputPath, fixesRef, fileExists } from './paths.mjs';
import { contractPrompt, clearStaleReport, extractReport } from './report.mjs';
import { appendRun } from './runlog.mjs';
import { runStreaming } from './progress.mjs';
import { status, writeStatus } from './status.mjs';
import { layersAbove, stackPrompt } from './stack.mjs';

// Fetches the layers above this MR into local refs (so the run can diff against
// them without network access) and lists the existing reviews of the stack, then
// renders the stack instructions. `stack` is { stacks, info } from poll.mjs.
async function buildStackPrompt(mr, stack) {
  const upperRefs = {};
  for (const iid of layersAbove(stack.stacks, mr.iid)) {
    const ref = `refs/marginalia/stack/${iid}`;
    try {
      await execFileAsync('git', ['fetch', '--quiet', 'origin', `+merge-requests/${iid}/head:${ref}`], { cwd: BOT_WORKTREE_DIR });
      upperRefs[iid] = ref;
    } catch (err) {
      warn(mr, `Could not fetch layer !${iid}, the review will not see it: ${err.message}`);
    }
  }
  const reviewPaths = {};
  for (const l of stack.info.layers) {
    const path = reviewOutputPath(l);
    if (l.iid !== mr.iid && (await fileExists(path))) reviewPaths[l.iid] = path;
  }
  return stackPrompt(mr, stack.info, { reviewPaths, upperRefs });
}

// The last steps of the running command, shown live in the studio.
const PROGRESS_LINES = 6;
function reportProgress(mr, step) {
  if (status.current?.iid !== mr.iid) return;
  status.current.progress = [...(status.current.progress ?? []), step].slice(-PROGRESS_LINES);
  writeStatus();
}

// Shared by both flows. `kind` is 'review' (someone else's MR) or 'triage'
// (my own MR, reviewer comments). The command can be anything: the bot injects
// the output contract with --append-system-prompt, and MR_REVIEW_BOT=1 stays
// in the env for commands written against the original contract.
async function runCommand(mr, { kind, command, tools, outputPath, label, stack = null }) {
  log(mr, `Starting ${label}: ${c.bold}"${mr.title}"${c.reset} (${mr.source_branch} -> ${mr.target_branch})`);

  if (await branchCheckedOutElsewhere(mr.source_branch)) {
    warn(mr, `Branch "${mr.source_branch}" is checked out in another worktree, skipping this pass.`);
    return 'skipped';
  }

  log(mr, 'Checking out MR branch in the bot worktree...');
  await checkoutMergeRequest(mr);
  await clearStaleReport(BOT_WORKTREE_DIR);
  const { stdout: baseSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: BOT_WORKTREE_DIR });
  const stackContext = stack && stack.info.size > 1 ? await buildStackPrompt(mr, stack) : '';
  if (stackContext) log(mr, `Layer ${stack.info.position}/${stack.info.size} of a stack on ${stack.info.baseBranch}.`);

  log(mr, `Running ${command} (this can take a few minutes)...`);
  const startedAt = Date.now();
  // The run needs the connectors of your logged-in claude.ai account, not
  // API-key billing, so ANTHROPIC_API_KEY (loaded from .env by dotenv) must
  // never reach this subprocess even if it's still set.
  const { ANTHROPIC_API_KEY: _unused, ...restEnv } = process.env;
  const claudeEnv = { ...restEnv, MR_REVIEW_BOT: '1' };
  const { stdout, stderr } = await runStreaming(
    CLAUDE_BIN,
    [
      '-p', `${command} MR !${mr.iid}`,
      '--output-format', 'stream-json',
      '--verbose',
      '--allowedTools', tools.join(' '),
      '--append-system-prompt', contractPrompt(kind, [REVIEW_PROMPT_EXTRA, stackContext].filter(Boolean).join('\n\n'), BOT_WORKTREE_DIR),
    ],
    { cwd: BOT_WORKTREE_DIR, env: claudeEnv },
    (step) => reportProgress(mr, step),
  );
  log(mr, `${c.green}Claude finished in ${Math.round((Date.now() - startedAt) / 1000)}s.${c.reset}`);

  const { text, stats } = parseRunOutput(stdout);
  if (stats) await appendRun({ iid: mr.iid, kind, command, ...stats });
  if (stats) log(mr, `Cost: $${stats.costUsd.toFixed(2)}, ${stats.outputTokens} output tokens, ${stats.turns} turns.`);
  const { content, source } = await extractReport({ worktreeDir: BOT_WORKTREE_DIR, stdout: text, stderr });
  if (source === 'stdout') {
    warn(mr, `${command} did not follow the output contract (no report file, no marker block): saved its raw final message as the report.`);
  }
  await writeFile(outputPath, content);

  if (kind === 'triage') {
    const { stdout: headSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: BOT_WORKTREE_DIR });
    if (headSha.trim() !== baseSha.trim()) {
      await execFileAsync('git', ['update-ref', `refs/heads/${fixesRef(mr)}`, 'HEAD'], { cwd: BOT_WORKTREE_DIR });
      log(mr, `Fixes committed locally (not pushed) — fetch them from your own checkout: git log ${fixesRef(mr)}`);
    }
  }
  log(mr, `Report (${source}) written to ${outputPath}. Nothing was posted to GitLab.`);
  return 'reviewed';
}

// The final `result` event of the run carries the final message, with the
// run's cost and usage. Anything else is treated as plain text.
export function parseRunOutput(stdout) {
  try {
    const out = JSON.parse(stdout);
    if (typeof out?.result !== 'string') return { text: stdout, stats: null };
    return {
      text: out.result,
      stats: {
        costUsd: Number(out.total_cost_usd ?? 0),
        outputTokens: out.usage?.output_tokens ?? 0,
        turns: out.num_turns ?? 0,
        durationMs: out.duration_ms ?? null,
      },
    };
  } catch {
    return { text: stdout, stats: null };
  }
}

export function runReview(mr, outputPath = reviewOutputPath(mr), stack = null) {
  return runCommand(mr, {
    stack,
    kind: 'review',
    command: REVIEW_COMMAND,
    tools: CLAUDE_ALLOWED_TOOLS,
    outputPath,
    label: 'review',
  });
}

export function runMrComments(mr) {
  return runCommand(mr, {
    kind: 'triage',
    command: TRIAGE_COMMAND,
    tools: CLAUDE_MR_COMMENTS_ALLOWED_TOOLS,
    outputPath: mrCommentsOutputPath(mr),
    label: 'comment triage',
  });
}
