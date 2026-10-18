// How a headless `claude -p` run is invoked and how its output is read. Pure, so
// the runner (claude-runner.mjs) stays about the flow.

// Variables whose name says they hold a credential. The run does not need the
// bot's GitLab/Jira tokens (it reads through your claude.ai connectors), and a
// prompt-injected run must not find them in its environment. CLAUDE_CODE_* is
// Claude's own login, so it stays.
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL|PRIVATE_?KEY)/i;

// The run needs the connectors of your logged-in claude.ai account, not
// API-key billing, so ANTHROPIC_API_KEY (loaded from .env by dotenv) must
// never reach this subprocess even if it's still set. MR_REVIEW_BOT=1 stays
// for commands written against the original contract. `passthrough` lists the
// secret-looking names a command really needs (CLAUDE_ENV_PASSTHROUGH).
export function claudeEnv(env, passthrough = []) {
  const keep = new Set(passthrough);
  const clean = Object.fromEntries(Object.entries(env).filter(([name]) => (
    name !== 'ANTHROPIC_API_KEY'
    && (keep.has(name) || name.startsWith('CLAUDE_CODE_') || !SECRET_NAME.test(name))
  )));
  return { ...clean, MR_REVIEW_BOT: '1' };
}

export function claudeArgs({ prompt, tools, systemPrompt, settings = null }) {
  return [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--allowedTools', tools.join(' '),
    ...(settings ? ['--settings', JSON.stringify(settings)] : []),
    '--append-system-prompt', systemPrompt,
  ];
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
        // The studio's chat resumes the latest run's session.
        sessionId: out.session_id ?? null,
      },
    };
  } catch {
    return { text: stdout, stats: null };
  }
}
