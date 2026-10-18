// Moves your tickets to their project's final status once every MR that names
// them is merged and its merge commit is in the tag served in prod (the commit
// is an ancestor of the tag). Nothing else is written to Jira. Each move, or
// the reason it could not be made, goes to jira-done.jsonl.
import { appendFile, readFile } from 'node:fs/promises';
import { JIRA_AUTO_DONE, JIRA_DONE_LOG, doneStatusOf } from './tickets-config.mjs';
import { jira } from './tickets-jira.mjs';
import { prodTags, inTag } from './tickets-mrs.mjs';

export const autoDoneEnabled = JIRA_AUTO_DONE === 'true';

async function log(entry) {
  await appendFile(JIRA_DONE_LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

export async function readDoneLog(limit = 50) {
  try {
    return (await readFile(JIRA_DONE_LOG, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(-limit).reverse();
  } catch {
    return [];
  }
}

// Proofs that every MR doing this ticket's work is in prod, or null.
async function prodProofs(ticket, tags) {
  // Only MRs that name the ticket in their title or branch do its work.
  const live = ticket.mrs.filter((mr) => mr.direct && mr.state !== 'closed');
  if (!live.length || live.some((mr) => mr.state !== 'merged')) return null;
  const proofs = [];
  for (const mr of live) {
    const tag = mr.manifestName ? tags[mr.manifestName] : null;
    if (!tag || !mr.mergeSha || !(await inTag(mr.project, mr.mergeSha, tag))) return null;
    proofs.push({ project: mr.project, iid: mr.iid, sha: mr.mergeSha, tag });
  }
  return proofs;
}

// Same ticket and same reason: logged once, not at every poll.
const lastNote = new Map();

export async function autoDone(data) {
  if (!autoDoneEnabled || !data) return [];
  const tags = await prodTags();
  const moved = [];
  for (const t of data.tickets) {
    const target = doneStatusOf[t.project];
    if (!t.mine || !target || t.status.name === target) continue;
    const proofs = await prodProofs(t, tags);
    if (!proofs) continue;
    const { transitions } = await jira(`/issue/${t.key}/transitions`);
    const move = transitions.find((tr) => tr.to?.name === target);
    if (!move) {
      const reason = `no transition from "${t.status.name}" to "${target}"`;
      if (lastNote.get(t.key) !== reason) await log({ key: t.key, from: t.status.name, to: target, done: false, reason, proofs });
      lastNote.set(t.key, reason);
      continue;
    }
    await jira(`/issue/${t.key}/transitions`, { method: 'POST', body: { transition: { id: move.id } } });
    await log({ key: t.key, from: t.status.name, to: target, done: true, transition: move.name, proofs });
    lastNote.delete(t.key);
    moved.push(t.key);
  }
  return moved;
}
