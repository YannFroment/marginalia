import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Where the injected contract asks the run to write its final report: a plain
// path in the worktree (a write under .claude/ is refused in headless runs).
export const REPORT_FILE = '.marginalia-report.md';

const REVIEW_FILE_BLOCK = /<<<REVIEW_FILE path="[^"]*">>>\n([\s\S]*?)\n<<<END_REVIEW_FILE>>>/;
const MIN_FALLBACK_CHARS = 200;
const TOOL_DENIED = /(?:tool|permission)[^\n]{0,80}(?:not allowed|denied|not permitted)|(?:not allowed|denied|not permitted)[^\n]{0,80}(?:tool|permission)/i;

export function contractPrompt(kind, extra = '', worktreeDir = '.', previousReport = null) {
  const lines = [
    'You are running headless, driven by marginalia. Rules for this run:',
    '- Never post, reply, or resolve anything on GitLab, and never `git push`.',
    `- Deliver your final report as markdown by writing it with the Write tool to this exact absolute path: ${join(worktreeDir, REPORT_FILE)} (NOT under .claude/). Do this yourself, in the top-level session, never inside a subagent: subagent output only reaches you as a tool result, so collect it and write the complete report yourself.`,
    '- If you entered a worktree (EnterWorktree), first exit it, then write the report: files written while inside it are discarded with it. If the Write is refused, print the report as your entire final message inside a block: <<<REVIEW_FILE path="report.md">>> ...report... <<<END_REVIEW_FILE>>>.',
    '- Your final message must be the report itself or the block, never a summary of it.',
    '- Do not ask the user questions; nobody can answer. Take the safest default.',
  ];
  if (kind === 'deepen' && previousReport) {
    lines.push(`- The automatic review of this MR is at ${previousReport} (it may be missing). Start from it: check its findings instead of redoing the whole review, and deliver the complete updated report.`);
  }
  if (kind === 'triage') {
    lines.push('- If you fix code, commit the changes locally with `git add -A && git commit` (never push) before finishing.');
  }
  if (extra.trim()) lines.push(extra.trim());
  return lines.join('\n');
}

export async function clearStaleReport(worktreeDir) {
  await rm(join(worktreeDir, REPORT_FILE), { force: true });
}

// Cascade: report file -> marker block on stdout -> raw stdout. Returns
// { content, source } where source is 'file' | 'block' | 'stdout', or throws
// with an actionable message.
export async function extractReport({ worktreeDir, stdout, stderr = '' }) {
  const reportPath = join(worktreeDir, REPORT_FILE);
  try {
    const content = await readFile(reportPath, 'utf8');
    await rm(reportPath, { force: true });
    if (content.trim()) return { content, source: 'file' };
  } catch {
    /* no report file */
  }

  const block = stdout.match(REVIEW_FILE_BLOCK);
  if (block) return { content: block[1], source: 'block' };

  const trimmed = stdout.trim();
  const denied = `${stdout}\n${stderr}`.match(TOOL_DENIED);
  if (denied) {
    throw new Error(`A tool was refused in headless mode ("${denied[0].trim()}"). Add it to CLAUDE_EXTRA_ALLOWED_TOOLS in .env.`);
  }
  if (trimmed.length >= MIN_FALLBACK_CHARS) {
    const banner = '> \u26a0\ufe0f **Non-standard output**: the command did not follow the bot contract, so this is its raw final message. It may be a summary rather than the full report.\n\n';
    return { content: `${banner}${trimmed}\n`, source: 'stdout' };
  }

  throw new Error(`The command produced no report (no ${REPORT_FILE}, no <<<REVIEW_FILE>>> block, stdout too short). Raw output: ${trimmed.slice(0, 500)}`);
}
