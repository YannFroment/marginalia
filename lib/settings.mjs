import { readFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { POLL_INTERVAL_MINUTES, STALE_AFTER_DAYS, ALLOWED_TARGET_BRANCHES, EXCLUDE_AUTHORS, SETTINGS_FILE } from './config.mjs';

export const MIN_POLL_MINUTES = 1;
export const MAX_POLL_MINUTES = 1440;
export const MAX_STALE_DAYS = 365;

const clamp = (n, min, max) => Math.min(max, Math.max(min, Math.round(n)));
const toList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);
const number = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);

// What .env says: the default of every setting.
export const envDefaults = () => ({
  pollIntervalMinutes: clamp(number(POLL_INTERVAL_MINUTES, 5), MIN_POLL_MINUTES, MAX_POLL_MINUTES),
  staleAfterDays: clamp(number(STALE_AFTER_DAYS, 14), 1, MAX_STALE_DAYS),
  allowedTargetBranches: toList(ALLOWED_TARGET_BRANCHES),
  excludeAuthors: toList(EXCLUDE_AUTHORS),
});

// Only the values changed from the studio; the rest stays on the .env default.
function readOverrides() {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {}; // no file yet, or unreadable: fall back to defaults
  }
}

// settings.json (written from the studio) wins over .env, which stays the
// default. Read fresh every time, so the bot and the studio never disagree and
// no restart is needed.
export function loadSettings() {
  const defaults = envDefaults();
  const file = readOverrides();
  return {
    pollIntervalMinutes: clamp(number(file.pollIntervalMinutes, defaults.pollIntervalMinutes), MIN_POLL_MINUTES, MAX_POLL_MINUTES),
    staleAfterDays: clamp(number(file.staleAfterDays, defaults.staleAfterDays), 1, MAX_STALE_DAYS),
    allowedTargetBranches: file.allowedTargetBranches === undefined ? defaults.allowedTargetBranches : toList(file.allowedTargetBranches),
    excludeAuthors: file.excludeAuthors === undefined ? defaults.excludeAuthors : toList(file.excludeAuthors),
  };
}

export const pollIntervalMs = () => loadSettings().pollIntervalMinutes * 60 * 1000;
export const staleAfterDays = () => loadSettings().staleAfterDays;
export const allowedTargets = () => loadSettings().allowedTargetBranches;
export const excludedAuthors = () => new Set(loadSettings().excludeAuthors.map((s) => s.toLowerCase()));

const integerIn = (key, min, max) => (v) => {
  const n = Number(v);
  if (v === '' || v === null || !Number.isInteger(n) || n < min || n > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
  return n;
};
const listOf = (key) => (v) => {
  if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) throw new Error(`${key} must be a list of strings`);
  const items = toList(v);
  if (items.some((s) => /[\s,]/.test(s))) throw new Error(`${key} entries cannot contain spaces or commas`);
  return [...new Set(items)];
};
const VALIDATORS = {
  pollIntervalMinutes: integerIn('pollIntervalMinutes', MIN_POLL_MINUTES, MAX_POLL_MINUTES),
  staleAfterDays: integerIn('staleAfterDays', 1, MAX_STALE_DAYS),
  allowedTargetBranches: listOf('allowedTargetBranches'),
  excludeAuthors: listOf('excludeAuthors'),
};

// A key set to null goes back to its .env default. Throws on invalid input so
// callers can answer 400; nothing is written then.
export async function saveSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('expected an object of settings');
  const unknown = Object.keys(patch).filter((k) => !(k in VALIDATORS));
  if (unknown.length) throw new Error(`unknown setting: ${unknown.join(', ')}`);
  const overrides = readOverrides();
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete overrides[key];
    else overrides[key] = VALIDATORS[key](value);
  }
  const tmp = `${SETTINGS_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(overrides, null, 2));
  await rename(tmp, SETTINGS_FILE);
  return loadSettings();
}
