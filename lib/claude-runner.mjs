import { execFileAsync } from './exec.mjs';
import { c, log, warn } from './log.mjs';
import { BOT_WORKTREE_DIR, CLAUDE_BIN, REVIEW_COMMAND, TRIAGE_COMMAND, REVIEW_PROMPT_EXTRA, REVIEWS_DIR } from './config.mjs';
import { CLAUDE_ALLOWED_TOOLS, CLAUDE_MR_COMMENTS_ALLOWED_TOOLS } from './allowed-tools.mjs';
import { archiveReview, discussionPrompt } from './history.mjs';
import { listDiscussions } from './gitlab.mjs';
import { branchCheckedOutElsewhere, checkoutMergeRequest } from './worktree.mjs';
import { perMrWorktrees, mrWorktree, syncOwned } from './mr-worktree.mjs';
import { reviewOutputPath, mrCommentsOutputPath, fileExists } from './paths.mjs';
import { recordFixes } from './fixes.mjs';
import { claudeArgs, parseRunOutput } from './claude-cli.mjs';
import { runEnv, runSettings } from './run-settings.mjs';
import { contractPrompt, clearStaleReport, buildReport, writeReportFiles } from './report.mjs';
import { appendRun } from './runlog.mjs';
import { runStreaming } from './progress.mjs';
import { status, writeStatus } from './status.mjs';
import { layersAbove, stackPrompt } from './stack.mjs';

// Fetches the layers above this MR into local refs (so the run can diff against
// them without network access) and lists the existing reviews of the stack, then
// renders the stack instructions. `stack` is { stacks, info } from poll.mjs.
async function buildStackPrompt(mr, stack, cwd) {
  const upperRefs = {};
  for (const iid of layersAbove(stack.stacks, mr.iid)) {
    const ref = `refs/marginalia/stack/${iid}`;
    try {
      await execFileAsync('git', ['fetch', '--quiet', 'origin', `+merge-requests/${iid}/head:${ref}`], { cwd });
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

// The folder the run works in: the MR's own worktree when there is one per MR
// (yours is used as it is, the bot's is synced), else the shared bot worktree.
// `botOwned` says whether the bot may commit there.
async function prepareWorkdir(mr) {
  if (perMrWorktrees) {
    log(mr, 'Preparing the MR worktree...');
    const worktree = await mrWorktree(mr);
    if (worktree.owned) await syncOwned(worktree.path, mr);
    log(mr, `Working in ${worktree.path}${worktree.owned ? '' : ' (your worktree, left as it is)'}`);
    return { workdir: worktree.path, botOwned: worktree.owned };
  }
  if (await branchCheckedOutElsewhere(mr.source_branch)) {
    warn(mr, `Branch "${mr.source_branch}" is checked out in another worktree, skipping this pass.`);
    return null;
  }
  log(mr, 'Checking out MR branch in the bot worktree...');
  await checkoutMergeRequest(mr);
  return { workdir: BOT_WORKTREE_DIR, botOwned: true };
}

// Shared by every flow. `kind` is 'review' (someone else's MR), 'triage' (my own
// MR, reviewer comments), 'deepen' or 'qa'. The command can be anything: the bot
// injects the output contract with --append-system-prompt. `tools` may be a
// function of { botOwned }, for flows that may only edit a folder the bot owns.
export async function runCommand(mr, { kind, command, tools, outputPath, label, stack = null }) {
  log(mr, `Starting ${label}: ${c.bold}"${mr.title}"${c.reset} (${mr.source_branch} -> ${mr.target_branch})`);
  const place = await prepareWorkdir(mr);
  if (!place) return 'skipped';
  const { workdir, botOwned } = place;
  await clearStaleReport(workdir);
  const { stdout: baseSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workdir });
  const stackContext = stack && stack.info.size > 1 ? await buildStackPrompt(mr, stack, workdir) : '';
  // A failed fetch must not block the review: it just runs without the conversation.
  const conversation = kind === 'review'
    ? await listDiscussions(mr.iid).then(discussionPrompt, (err) => { warn(mr, `Could not read the MR discussions: ${err.message}`); return ''; })
    : '';
  if (stackContext) log(mr, `Layer ${stack.info.position}/${stack.info.size} of a stack on ${stack.info.baseBranch}.`);

  log(mr, `Running ${command} (this can take a few minutes)...`);
  const startedAt = Date.now();
  const systemPrompt = contractPrompt(kind, [REVIEW_PROMPT_EXTRA, stackContext, conversation].filter(Boolean).join('\n\n'), workdir, reviewOutputPath(mr));
  const allowed = typeof tools === 'function' ? tools({ botOwned }) : tools;
  const { stdout, stderr } = await runStreaming(
    CLAUDE_BIN,
    claudeArgs({ prompt: `${command} MR !${mr.iid}`, tools: allowed, systemPrompt, settings: runSettings(workdir) }),
    { cwd: workdir, env: runEnv() },
    (step) => reportProgress(mr, step),
  );
  log(mr, `${c.green}Claude finished in ${Math.round((Date.now() - startedAt) / 1000)}s.${c.reset}`);

  const { text, stats } = parseRunOutput(stdout);
  if (stats) await appendRun({ iid: mr.iid, kind, command, ...stats });
  if (stats) log(mr, `Cost: $${stats.costUsd.toFixed(2)}, ${stats.outputTokens} output tokens, ${stats.turns} turns.`);
  const report = await buildReport({ worktreeDir: workdir, stdout: text, stderr });
  const { content, source, shape } = report;
  if (source === 'stdout') {
    warn(mr, `${command} did not follow the output contract (no report file, no marker block): saved its raw final message as the report.`);
  }
  if (shape.warnings.length) warn(mr, `Report contract: ${shape.warnings.join(' ')}`);
  if (await archiveReview(outputPath, content)) log(mr, `Previous report kept in ${REVIEWS_DIR}/.history.`);
  await writeReportFiles(outputPath, report, baseSha.trim());

  // Fixes are only recorded where the bot may commit: never in your own worktree.
  if (kind === 'triage' && botOwned) await recordFixes(mr, baseSha.trim(), workdir);
  log(mr, `Report (${source}) written to ${outputPath}. Nothing was posted to GitLab.`);
  return 'reviewed';
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
    // In your own worktree the triage only proposes: no Edit, nothing committed.
    tools: ({ botOwned }) => (botOwned ? CLAUDE_MR_COMMENTS_ALLOWED_TOOLS : CLAUDE_ALLOWED_TOOLS),
    outputPath: mrCommentsOutputPath(mr),
    label: 'comment triage',
  });
}
