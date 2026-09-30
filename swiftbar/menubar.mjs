// SwiftBar plugin body: reads the status.json written by poll.mjs and prints
// the menu bar item + a small dropdown (bot state, open the studio, poll now).
// Reviews themselves are listed in the studio (studio/server.mjs), not here. Invoked by
// marginalia.10s.sh (the file you symlink into SwiftBar's plugin folder).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_FILE = join(ROOT, 'status.json');
// This plugin doesn't load dotenv: read STUDIO_PORT straight from .env (default 4477, as lib/config.mjs).
function studioPort() {
  try {
    return readFileSync(join(ROOT, '.env'), 'utf8').match(/^(?:STUDIO|VIEWER)_PORT=(\d+)/m)?.[1] ?? '4477';
  } catch {
    return '4477';
  }
}
const STUDIO_URL = `http://localhost:${studioPort()}`;

function readStatus() {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return err.code === 'EPERM';
  }
}

// `|` separates text from parameters in SwiftBar lines, so it can't appear in
// free text coming from GitLab.
function clean(text) {
  return String(text ?? '').replace(/\|/g, '¦').replace(/\s+/g, ' ').trim();
}

function ago(iso) {
  if (!iso) return '?';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h`;
}

// e.g. "23/09 16:21", in local time.
function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inTime(iso) {
  if (!iso) return '?';
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return 'any moment now';
  if (s < 60) return `in ${s} s`;
  return `in ${Math.round(s / 60)} min`;
}

// `href=` would use the default browser; links go to Chrome instead.
function openInChrome(url) {
  return `bash=/usr/bin/open param1=-a param2="Google Chrome" param3="${url}" terminal=false`;
}

const status = readStatus();
const alive = status && status.phase !== 'stopped' && isAlive(status.pid);
const lines = [];

// --- Menu bar item ---
const failedCount = alive ? status.mrs.filter((m) => m.status === 'failed').length : 0;
if (!alive) {
  lines.push('| sfimage=xmark.octagon sfcolor=gray');
} else if (status.phase === 'error') {
  lines.push('| sfimage=exclamationmark.triangle.fill sfcolor=red');
} else if (status.phase === 'reviewing' && status.current) {
  lines.push(`!${status.current.iid} | sfimage=eye`);
} else if (status.phase === 'polling') {
  lines.push('| sfimage=arrow.triangle.2.circlepath');
} else if (failedCount > 0) {
  lines.push(`${failedCount} | sfimage=checkmark.seal sfcolor=orange`);
} else {
  lines.push('| sfimage=checkmark.seal');
}
lines.push('---');

// --- Status header ---
if (!status) {
  lines.push('Marginalia: never started (no status.json)');
} else if (!alive) {
  lines.push('Marginalia: stopped | color=gray');
  if (status.lastPoll) lines.push(`Last poll ${ago(status.lastPoll.at)} ago | size=12`);
} else {
  if (status.phase === 'reviewing' && status.current) {
    lines.push(`Reviewing !${status.current.iid} for ${ago(status.current.startedAt)}`);
    lines.push(`${clean(status.current.title)} | size=12 length=70 ${openInChrome(status.current.web_url)}`);
  } else if (status.phase === 'polling') {
    lines.push('Polling MRs…');
  } else if (status.phase === 'error') {
    lines.push('Last poll failed | color=red');
    lines.push(`${clean(status.lastPoll?.error)} | size=12 length=70`);
  } else {
    lines.push('Idle');
  }
  const pollInfo = [
    status.lastPoll && `last poll ${ago(status.lastPoll.at)} ago`,
    status.nextPollAt && status.phase !== 'polling' && status.phase !== 'reviewing' && `next ${inTime(status.nextPollAt)}`,
  ].filter(Boolean);
  if (pollInfo.length) lines.push(`${pollInfo.join(' · ')} | size=12`);
}
const lastReviewed = (status?.mrs ?? [])
  .filter((m) => m.reviewedAt)
  .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
if (lastReviewed) {
  lines.push(`Last review: !${lastReviewed.iid} on ${formatDate(lastReviewed.reviewedAt)} (${ago(lastReviewed.reviewedAt)} ago) | size=12`);
}

// --- Actions ---
lines.push('---');
if (alive) {
  const busy = status.phase === 'polling' || status.phase === 'reviewing';
  lines.push(
    busy
      ? 'Poll now | color=gray sfimage=arrow.clockwise'
      : `Poll now | bash=/bin/kill param1=-USR1 param2=${status.pid} terminal=false refresh=true sfimage=arrow.clockwise`,
  );
}
lines.push(`Open reviews | ${openInChrome(STUDIO_URL)} sfimage=rectangle.grid.2x2`);
if (status) {
  lines.push(`Open status.json | bash=/usr/bin/open param1="${STATUS_FILE}" terminal=false sfimage=curlybraces`);
}
lines.push('Refresh | refresh=true');

console.log(lines.join('\n'));
