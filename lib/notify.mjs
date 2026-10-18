import { execFile } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTIFICATIONS, VSCODE_BIN, STUDIO_PORT } from './config.mjs';

// Same mark as the studio favicon, rasterised: terminal-notifier can't read SVG.
const LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'studio', 'public', 'logo.png');

// Title and message go through argv rather than being spliced into the
// AppleScript source, so MR titles with quotes can't break it.
//
// openPath, when given, makes the notification clickable: clicking it opens
// the review in the local studio (studio/server.mjs), or in VS Code if the
// studio isn't listening. Plain `display notification` via osascript has no
// click action, so this needs terminal-notifier (`brew install
// terminal-notifier`) instead.
function openCommand(openPath) {
  const slug = basename(openPath, '.md');
  const url = `http://localhost:${STUDIO_PORT}/#/${slug}`;
  return `curl -sf -m 1 -o /dev/null http://127.0.0.1:${STUDIO_PORT}/api/reviews && open "${url}" || ${VSCODE_BIN} "${openPath}"`;
}

export function notify(title, message, openPath) {
  if (NOTIFICATIONS === 'false') return;
  const plain = () => execFile(
    'osascript',
    ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', title, message],
    () => {},
  );
  const args = ['-title', title, '-message', message, '-appIcon', LOGO_PATH];
  if (openPath) args.push('-execute', openCommand(openPath));
  // terminal-notifier isn't a default macOS install (`brew install
  // terminal-notifier`); if it's missing, still notify, just without the
  // logo and click action.
  execFile('terminal-notifier', args, (err) => { if (err) plain(); });
}
