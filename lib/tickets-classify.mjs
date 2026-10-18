import { spawn } from 'node:child_process';
import { CLAUDE_BIN } from './config.mjs';
import { TICKET_PROFILE, TICKET_CLASSIFY_MODEL, mrProjects } from './tickets-config.mjs';
import { claudeEnv } from './claude-cli.mjs';

const BATCH = 20;
const BATCHES_PER_RUN = 20;

// What the title prefix, the labels and the linked MRs already say; null when the
// model must decide. `ticket` is { fields: { summary, labels } }.
export function obviousClass(ticket, mrs) {
  const prefix = ticket.fields.summary.match(/^\s*\[(FE|BE|Front[\w-]*|Back[\w-]*)\b/i)?.[1]?.toLowerCase();
  if (prefix) return { front: prefix.startsWith('f'), reason: 'title prefix', by: 'rule' };
  const labels = ticket.fields.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => ['frontend', 'front', 'fe', 'front-end'].includes(l))) return { front: true, reason: 'label', by: 'rule' };
  if (labels.some((l) => ['backend', 'back', 'be', 'back-end'].includes(l))) return { front: false, reason: 'label', by: 'rule' };
  const front = mrProjects[0]?.path;
  if (mrs.some((mr) => mr.direct && mr.project === front)) return { front: true, reason: `MR in ${front}`, by: 'rule' };
  return null;
}

function ask(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--model', TICKET_CLASSIFY_MODEL, '--output-format', 'json', '--setting-sources', '', '--tools', ''];
    const child = spawn(CLAUDE_BIN, args, { env: claudeEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const res = JSON.parse(out);
        resolve({ text: res.result ?? '', costUsd: res.total_cost_usd ?? 0 });
      } catch {
        reject(new Error(`classifier exited ${code}`));
      }
    });
  });
}

// Asks the model about the tickets `classes` doesn't know yet, BATCH at a time,
// and records its answers there. Returns what it cost.
export async function classify(tickets, classes) {
  const todo = tickets.filter((t) => !classes[t.key]);
  let spent = 0;
  for (let i = 0; i < Math.min(todo.length, BATCH * BATCHES_PER_RUN); i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const list = batch.map((t) => `### ${t.key} [${t.fields.project.key}, ${t.fields.issuetype?.name}] ${t.fields.summary}\nLabels: ${t.fields.labels.join(', ') || 'none'}\n${t.text.slice(0, 1200)}`).join('\n\n');
    const prompt = `You sort Jira tickets for ${TICKET_PROFILE}. For each ticket below, decide whether its main work is front-end (user interface code: the web app, its design system, or a browser front end) or not (back end, data, infra, ops, product or content work). Answer with a JSON array only, one object per ticket: {"key": "...", "front": true|false, "reason": "<at most 12 words, English>"}.\n\n${list}`;
    try {
      const { text, costUsd } = await ask(prompt);
      spent += costUsd;
      const answers = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
      for (const a of answers) {
        if (batch.some((t) => t.key === a.key)) classes[a.key] = { front: Boolean(a.front), reason: String(a.reason ?? '').slice(0, 120), by: TICKET_CLASSIFY_MODEL, at: new Date().toISOString() };
      }
    } catch (err) {
      console.warn(`[tickets] classification batch failed: ${err.message}`);
      break;
    }
  }
  return spent;
}
