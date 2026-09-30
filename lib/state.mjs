import { readFile, writeFile } from 'node:fs/promises';
import { STATE_FILE } from './config.mjs';

export async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}
