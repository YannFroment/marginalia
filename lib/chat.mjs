import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { BOT_WORKTREE_DIR, CLAUDE_BIN } from './config.mjs';
import { CHAT_SYSTEM, CHAT_TOOLS } from './chat-prompt.mjs';
import { claudeArgs, parseRunOutput } from './claude-cli.mjs';
import { runEnv, runSettings } from './run-settings.mjs';
import { runStreaming } from './progress.mjs';
import { appendRun } from './runlog.mjs';

const TIMEOUT_MS = 180_000;

// One question to a headless, read-only Claude about a stop of a review. Same
// sandbox, deny rules and environment scrubbing as the review runs; the answer
// is returned, never posted. Runs in the bot's checkout when there is one.
export async function askAboutStop({ iid, prompt }) {
  const cwd = existsSync(BOT_WORKTREE_DIR) ? BOT_WORKTREE_DIR : tmpdir();
  const { stdout } = await runStreaming(
    CLAUDE_BIN,
    claudeArgs({ prompt, tools: CHAT_TOOLS, systemPrompt: CHAT_SYSTEM, settings: runSettings() }),
    { cwd, timeout: TIMEOUT_MS, env: runEnv() },
  );
  const { text, stats } = parseRunOutput(stdout);
  if (stats) await appendRun({ iid, kind: 'chat', command: 'chat', ...stats });
  if (!text.trim()) throw new Error('Claude returned no answer');
  return text.trim();
}
