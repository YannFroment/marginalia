import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FINDINGS_FILE, buildShape } from './findings.mjs';

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
    `- Strongly recommended: also write the same findings as JSON with the Write tool to ${join(worktreeDir, FINDINGS_FILE)}, so the studio can count them and offer each comment for posting whatever your report looks like. Shape: {"verdict": "APPROVE" | "REQUEST_CHANGES", "summary": "one or two sentences", "risk": {"level": "low" | "medium" | "high", "rationale": "why, in one sentence", "factors": ["blast radius, missing tests, auth/data/migration touched..."]}, "overview": {"before": "what the code did before this MR, in plain words", "after": "what it does now, in plain words"}, "tour": [{"title": "the one idea of this chapter, in plain words", "summary": "what changed and why, in plain words, then what to check", "files": ["repo/relative/file.ts"], "findings": ["ids of findings to attach"]}], "findings": [{"id": "optional stable id", "severity": "critical" | "important" | "suggestion" | "info", "title": "short title", "path": "repo/relative/file.ts", "line": 42, "body": "what is wrong and why", "comment": "the comment to post on the MR, ready as is"}]}. risk and tour are optional but they are what lets a reader grasp the MR without opening every file: order the tour chapters by what matters: the core change first, then what supports it, and database, tests and generated files last, and give a finding an id when a stop must reference it; path, line, id and comment are optional; use "path" without "line" to comment on a whole file. Keep the markdown report as the human-readable version.`,
  ];
  if (kind === 'qa') {
    lines.push(`- The review of this MR is at ${previousReport ?? 'the reviews folder'}. Deliver only its QA section, starting with "## QA": what you tested, how, and what happened.`);
  }
  if (kind === 'deepen' && previousReport) {
    lines.push(`- The automatic review of this MR is at ${previousReport} (it may be missing). Start from it: check its findings instead of redoing the whole review, and deliver the complete updated report.`);
  }
  if (kind === 'triage') {
    lines.push('- If you fix code, commit the changes locally with `git add -A && git commit` (never push) before finishing.');
    lines.push('- Write everything in English: the report, every drafted reply, the findings JSON and the commit messages. This holds whatever language the command, the reviewer comments, the ticket or this session use; do not translate the quoted comments themselves.');
  }
  if (extra.trim()) lines.push(extra.trim());
  return lines.join('\n');
}

export async function clearStaleReport(worktreeDir) {
  await Promise.all([REPORT_FILE, FINDINGS_FILE].map((f) => rm(join(worktreeDir, f), { force: true })));
}

// The structured findings the run wrote, or null. Consumed (removed) so the next
// run can't pick up a stale one.
export async function extractFindings(worktreeDir) {
  const path = join(worktreeDir, FINDINGS_FILE);
  try {
    const raw = await readFile(path, 'utf8');
    await rm(path, { force: true });
    return raw.trim() ? raw : null;
  } catch {
    return null;
  }
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

// Everything the bot guarantees about a run's output, whatever the command that
// produced it: the markdown report, plus a normalized shape (see findings.mjs)
// built from the findings file when there is one, from the report otherwise.
export async function buildReport({ worktreeDir, stdout, stderr = '' }) {
  const { content, source } = await extractReport({ worktreeDir, stdout, stderr });
  const findingsRaw = await extractFindings(worktreeDir);
  return { content, source, shape: buildShape({ markdown: content, findingsRaw }) };
}

// Writes <slug>.md and <slug>.findings.json next to each other. `reviewedSha` is the head
// commit the run read: it is what lets the studio show the code this review covered.
export async function writeReportFiles(outputPath, { content, shape }, reviewedSha = null) {
  await writeFile(outputPath, content);
  const stored = { ...shape, generatedAt: new Date().toISOString(), ...(reviewedSha && { reviewedSha }) };
  await writeFile(outputPath.replace(/\.md$/, '.findings.json'), `${JSON.stringify(stored, null, 2)}\n`);
}
