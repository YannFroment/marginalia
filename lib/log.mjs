export const isFancyTerminal = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
export const c = isFancyTerminal
  ? {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
    }
  : new Proxy({}, { get: () => '' });

// Wraps `!123` in an OSC 8 escape so terminals that support it (iTerm2, VS Code,
// Ghostty, ...) render it as a clickable link straight to the MR on GitLab.
function mrLink(mr) {
  const label = `!${mr.iid}`;
  if (!isFancyTerminal || !mr.web_url) return label;
  return `\x1b]8;;${mr.web_url}\x07${label}\x1b]8;;\x07`;
}

export function timestamp() {
  return `${c.dim}[${new Date().toISOString()}]${c.reset}`;
}

export function mrTag(mr) {
  return `${c.cyan}[MR ${mrLink(mr)}]${c.reset}`;
}

export function log(mr, msg) {
  console.log(`${timestamp()} ${mrTag(mr)} ${msg}`);
}

export function warn(mr, msg) {
  console.warn(`${timestamp()} ${c.yellow}${mrTag(mr)} ${msg}${c.reset}`);
}
