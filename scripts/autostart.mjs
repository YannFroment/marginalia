// Starts the bot at login on macOS through a per-user LaunchAgent (no sudo):
// `npm run autostart` installs and starts it, `-- --uninstall` removes it,
// `-- --status` tells whether it's running. Logs go to ~/Library/Logs/marginalia.log.
// If SwiftBar is installed, a second agent opens it at login for the menu bar icon.
import '../lib/node-check.mjs';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents');
const BOT = 'com.marginalia.bot';
const MENUBAR = 'com.marginalia.swiftbar';
const plistPath = (label) => join(AGENTS_DIR, `${label}.plist`);
const LOG = join(homedir(), 'Library', 'Logs', 'marginalia.log');
const DOMAIN = `gui/${userInfo().uid}`;
const SWIFTBAR_APP = ['/Applications', join(homedir(), 'Applications')]
  .map((dir) => join(dir, 'SwiftBar.app'))
  .find((app) => existsSync(app));

if (process.platform !== 'darwin') {
  console.error('autostart only supports macOS (LaunchAgent). Use pm2 or systemd elsewhere.');
  process.exit(1);
}

const launchctl = (...args) => execFileSync('launchctl', args, { stdio: 'pipe' }).toString();
const loaded = (label) => { try { launchctl('print', `${DOMAIN}/${label}`); return true; } catch { return false; } };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// bootout returns before the job is gone, and bootstrapping it again meanwhile
// fails with "5: Input/output error": wait until launchd has let it go.
const unload = (label) => {
  if (!loaded(label)) return;
  try { launchctl('bootout', `${DOMAIN}/${label}`); } catch { /* already going away */ }
  for (let i = 0; i < 50 && loaded(label); i += 1) sleep(200);
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const install = (label, keys) => {
  writeFileSync(plistPath(label), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
${keys}
</dict>
</plist>
`);
  unload(label);
  launchctl('bootstrap', DOMAIN, plistPath(label));
};

const remove = (label) => {
  unload(label);
  if (existsSync(plistPath(label))) unlinkSync(plistPath(label));
};

// The plugin is only picked up if it sits in SwiftBar's plugin folder.
const swiftbarPluginLinked = () => {
  try {
    const dir = execFileSync('defaults', ['read', 'com.ameba.SwiftBar', 'PluginDirectory'], { stdio: 'pipe' }).toString().trim();
    return existsSync(join(dir, 'marginalia.10s.sh'));
  } catch {
    return false;
  }
};

const arg = process.argv[2];

if (arg === '--uninstall') {
  remove(BOT);
  remove(MENUBAR);
  console.log('Autostart removed. The bot is stopped (SwiftBar keeps running until you quit it).');
} else if (arg === '--status') {
  try {
    const out = launchctl('print', `${DOMAIN}/${BOT}`);
    const state = out.match(/^\s*state = (.+)$/m)?.[1] ?? 'unknown';
    const pid = out.match(/^\s*pid = (\d+)$/m)?.[1];
    console.log(`Autostart installed, ${state}${pid ? ` (pid ${pid})` : ''}. Logs: ${LOG}`);
  } catch {
    console.log(existsSync(plistPath(BOT)) ? 'Autostart installed but not loaded: npm run autostart' : 'Autostart not installed.');
  }
  console.log(existsSync(plistPath(MENUBAR)) ? 'SwiftBar opens at login.' : 'SwiftBar is not opened at login.');
} else if (arg) {
  console.error(`Unknown option ${arg}. Use --status or --uninstall.`);
  process.exit(1);
} else {
  if (!existsSync(join(ROOT, 'studio', 'dist'))) console.warn('! Studio not built (npm run studio:build), http://localhost:4477 will show 503.');
  mkdirSync(AGENTS_DIR, { recursive: true });
  // launchd starts with a bare PATH: keep this shell's, so `claude`, `git` and
  // terminal-notifier resolve the same way as when you run `npm start`.
  install(BOT, `  <key>ProgramArguments</key>
  <array>
    <string>${esc(process.execPath)}</string>
    <string>${esc(join(ROOT, 'poll.mjs'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${esc(process.env.PATH ?? '/usr/bin:/bin')}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${esc(LOG)}</string>
  <key>StandardErrorPath</key><string>${esc(LOG)}</string>`);
  console.log(`Autostart installed (${plistPath(BOT)}).
The bot is running now and will start at every login.
  Studio: http://localhost:4477
  Logs:   tail -f ${LOG}
Re-run \`npm run autostart\` after changing Node version (it pins ${process.execPath}).`);

  if (SWIFTBAR_APP) {
    // A one-shot `open`: SwiftBar is a regular app, launchd only starts it.
    install(MENUBAR, `  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>${esc(SWIFTBAR_APP)}</string>
  </array>
  <key>RunAtLoad</key><true/>`);
    console.log('SwiftBar opened, and will open at every login.');
    if (!swiftbarPluginLinked()) console.warn('! The marginalia plugin is not in SwiftBar\'s plugin folder: see "Menu bar icon" in the README.');
  } else {
    remove(MENUBAR);
  }
}
