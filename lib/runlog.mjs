import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

// One line per Claude run, to know what the automatic pass and the on-demand
// passes really cost. Never fatal: a failed write only loses a log line.
export const RUNS_FILE = join(ROOT, 'runs.jsonl');

export async function appendRun(entry) {
  try {
    await appendFile(RUNS_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch (err) {
    console.error(`Could not write ${RUNS_FILE}:`, err.message);
  }
}


// The Claude session of the latest run on each MR, so it can be resumed in a
// terminal: { [iid]: sessionId }.
export async function lastSessionByMr() {
  const byMr = {};
  let raw = '';
  try {
    raw = await readFile(RUNS_FILE, 'utf8');
  } catch {
    return byMr;
  }
  for (const line of raw.split('\n')) {
    try {
      const { iid, sessionId } = JSON.parse(line);
      if (sessionId) byMr[iid] = sessionId;
    } catch {
      /* skip a broken line */
    }
  }
  return byMr;
}
