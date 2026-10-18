import { readFile, rm, writeFile } from 'node:fs/promises';
import { DEEPEN_COMMAND, QA_COMMAND } from './config.mjs';
import { CLAUDE_DEEPEN_ALLOWED_TOOLS, CLAUDE_QA_ALLOWED_TOOLS } from './allowed-tools.mjs';
import { reviewOutputPath } from './paths.mjs';
import { mergeQaSection } from './qa-section.mjs';
import { runCommand } from './claude-runner.mjs';

// The studio's on-demand runs on one MR: the deep review rewrites the review
// file, QA adds its section to it.
export function runDeepen(mr) {
  return runCommand(mr, {
    kind: 'deepen',
    command: DEEPEN_COMMAND,
    tools: CLAUDE_DEEPEN_ALLOWED_TOOLS,
    outputPath: reviewOutputPath(mr),
    label: 'deep review',
  });
}

// The QA run writes a section, merged into the review file once it succeeds.
export async function runQa(mr) {
  const reviewPath = reviewOutputPath(mr);
  const qaPath = `${reviewPath}.qa.tmp`;
  const outcome = await runCommand(mr, {
    kind: 'qa',
    command: QA_COMMAND,
    tools: CLAUDE_QA_ALLOWED_TOOLS,
    outputPath: qaPath,
    label: 'QA',
  });
  if (outcome !== 'reviewed') return outcome;
  const review = await readFile(reviewPath, 'utf8').catch(() => `# !${mr.iid} ${mr.title}\n`);
  await writeFile(reviewPath, mergeQaSection(review, await readFile(qaPath, 'utf8')));
  await rm(qaPath, { force: true });
  return outcome;
}
