import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { NOTIFICATIONS, VSCODE_BIN, STUDIO_PORT } from './config.mjs';

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
  if (openPath) {
    execFile(
      'terminal-notifier',
      ['-title', title, '-message', message, '-execute', openCommand(openPath)],
      // terminal-notifier isn't a default macOS install (`brew install
      // terminal-notifier`); if it's missing, still notify, just without the
      // click action.
      (err) => { if (err) plain(); },
    );
    return;
  }
  plain();
}
