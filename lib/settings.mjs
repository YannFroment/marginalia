import { readFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { POLL_INTERVAL_MINUTES, SETTINGS_FILE } from './config.mjs';

export const MIN_POLL_MINUTES = 1;
export const MAX_POLL_MINUTES = 1440;

const clampMinutes = (n) => Math.min(MAX_POLL_MINUTES, Math.max(MIN_POLL_MINUTES, Math.round(n)));

// settings.json (written from the studio) wins over POLL_INTERVAL_MINUTES in
// .env, which stays the default. Read fresh every time, so the bot and the
// studio never disagree and no restart is needed.
export function loadSettings() {
  let fromFile = {};
  try {
    fromFile = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    /* no file yet, or unreadable: fall back to defaults */
  }
  const minutes = Number(fromFile.pollIntervalMinutes ?? POLL_INTERVAL_MINUTES);
  return { pollIntervalMinutes: Number.isFinite(minutes) ? clampMinutes(minutes) : 5 };
}

export const pollIntervalMs = () => loadSettings().pollIntervalMinutes * 60 * 1000;

// Throws on invalid input so callers can answer 400.
export async function saveSettings(patch) {
  const minutes = Number(patch?.pollIntervalMinutes);
  if (!Number.isInteger(minutes) || minutes < MIN_POLL_MINUTES || minutes > MAX_POLL_MINUTES) {
    throw new Error(`pollIntervalMinutes must be an integer between ${MIN_POLL_MINUTES} and ${MAX_POLL_MINUTES}`);
  }
  const next = { ...loadSettings(), pollIntervalMinutes: minutes };
  const tmp = `${SETTINGS_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2));
  await rename(tmp, SETTINGS_FILE);
  return next;
}
