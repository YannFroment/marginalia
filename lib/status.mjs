import { writeFile, rename } from 'node:fs/promises';
import { STATUS_FILE, REVIEWS_DIR } from './config.mjs';
import { timestamp, c } from './log.mjs';

// What the menu bar plugin shows. Kept in memory and flushed to status.json
// after every change.
export const status = {
  pid: process.pid,
  startedAt: new Date().toISOString(),
  phase: 'idle', // idle | polling | reviewing | error | stopped
  current: null, // MR being reviewed right now
  lastPoll: null, // { at, ok, error }
  nextPollAt: null,
  reviewsDir: REVIEWS_DIR,
  mrs: [],
};

let statusWrite = Promise.resolve();

// Writes go through a temp file + rename so the plugin never reads a
// half-written file, and are chained so two writes never race on the rename.
export function writeStatus() {
  statusWrite = statusWrite
    .then(async () => {
      const tmp = `${STATUS_FILE}.tmp`;
      await writeFile(tmp, JSON.stringify(status, null, 2));
      await rename(tmp, STATUS_FILE);
    })
    .catch((err) => console.error(`${timestamp()} ${c.red}Could not write ${STATUS_FILE}:${c.reset}`, err));
  return statusWrite;
}

export function setMrStatus(mr, patch) {
  const entry = status.mrs.find((m) => m.iid === mr.iid);
  if (entry) Object.assign(entry, patch);
  return writeStatus();
}
