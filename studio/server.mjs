// Local review reader: JSON API over REVIEWS_DIR + status.json, live updates
// over SSE, and the built React app (studio/dist) as static files. Bound to
// 127.0.0.1 only; read-only apart from PUT /api/settings (the Settings page) and,
// when ALLOW_POSTING=true, POST /api/post (comment on the MR, after confirmation),
// POST /api/rerun (queue a fresh review of one MR) and, when ALLOW_PUSH=true,
// POST /api/push (push a triage's local fixes to the MR branch).
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEWS_DIR, STATUS_FILE, STUDIO_PORT, ALLOW_POSTING, ALLOW_PUSH, JIRA_BASE_URL, DEEPEN_COMMAND, QA_COMMAND, BOT_WORKTREE_DIR, CLAUDE_BIN, IDE_COMMAND, IDE_FOLDER_COMMAND, encodedProjectId } from '../lib/config.mjs';
import { fixesStatus, pushFixes } from '../lib/fixes.mjs';
import { TRIAGE_FILE_PREFIX, fileExists } from '../lib/paths.mjs';
import { loadPosted, savePosted } from '../lib/posted.mjs';
import { listHistory, readHistory } from '../lib/history.mjs';
import { buildShape, listFields, loadShape } from '../lib/findings.mjs';
import { fetchReviewState } from '../lib/mr-state.mjs';
import { filesForPatterns, toDiffFile } from '../lib/mr-diff.mjs';
import { reviewDiff } from '../lib/review-diff.mjs';
import { reviewThreads } from '../lib/review-threads.mjs';
import { listMergeRequestDiffs, findPublishedNoteId, mergeRequestNoteExists, approveMergeRequest, gitlabRequest } from '../lib/gitlab.mjs';
import { TICKETS_FILE } from '../lib/tickets-config.mjs';
import { ticketsEnabled } from '../lib/tickets.mjs';
import { autoDoneEnabled, readDoneLog } from '../lib/jira-done.mjs';
import { FACTORY_URL } from '../lib/config.mjs';
import { lastRunsByMr } from '../lib/runlog.mjs';
import { CLAUDE_ALLOWED_TOOLS } from '../lib/allowed-tools.mjs';
import { execFileAsync } from '../lib/exec.mjs';
import { parseReviewAction, reviewerStateFor } from '../lib/review-actions.mjs';
import { createDraftNote, createInlineDraftNote, listDraftNotes, updateDraftNote, deleteDraftNote, publishDraftNotes, draftNoteExists } from '../lib/gitlab-drafts.mjs';
import { byPriorityThenDate } from '../lib/jira.mjs';
import { envDefaults, loadSettings, saveSettings } from '../lib/settings.mjs';
import { loadState, saveState } from '../lib/state.mjs';
import { parseAcrossLayers } from '../lib/stack.mjs';
import { appendRun, lastSessionByMr } from '../lib/runlog.mjs';
import { createChats } from '../lib/chat.mjs';
import { perMrWorktrees, listWorktrees, existingWorktree, mrWorktree, uncommitOwned } from '../lib/mr-worktree.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const SLUG_RE = /^[\w.-]+$/;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function readStatus() {
  try {
    return JSON.parse(await readFile(STATUS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function kindOf(slug) {
  if (slug.startsWith(TRIAGE_FILE_PREFIX)) return 'comments';
  return 'review';
}

// Forgets posted comments that were deleted on GitLab, so they can be posted
// again and lose their "Posted" badge. Throttled (the client polls every 30 s),
// serialized with posting, and a failed check never drops anything.
let lastReconcile = 0;
async function reconcilePosted() {
  if (ALLOW_POSTING !== 'true' || Date.now() - lastReconcile < 15_000) return;
  lastReconcile = Date.now();
  const run = postQueue.then(async () => {
    const posted = await loadPosted();
    let changed = false;
    for (const [key, info] of Object.entries(posted)) {
      if (!info.iid) continue;
      try {
        if (info.state === 'draft') {
          if (await draftNoteExists(info.iid, info.draftId)) continue;
          // Gone from the drafts: published from GitLab itself, or deleted there.
          const noteId = info.body ? await findPublishedNoteId(info.iid, info.body) : null;
          if (noteId) {
            posted[key] = { ...info, state: 'published', url: `${info.mrUrl}#note_${noteId}` };
            delete posted[key].draftId;
          } else delete posted[key];
          changed = true;
          continue;
        }
        const noteId = info.url?.match(/#note_(\d+)$/)?.[1];
        if (noteId && !(await mergeRequestNoteExists(info.iid, noteId))) {
          delete posted[key];
          changed = true;
        }
      } catch {
        /* GitLab unreachable: keep it for now */
      }
    }
    if (changed) {
      await savePosted(posted);
      broadcast();
    }
  });
  postQueue = run.catch(() => {});
  await run.catch(() => {});
}

// The MR tracked in status.json for a review slug, or undefined.
async function trackedMr(slug) {
  const status = await readStatus();
  return (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
}

// Stacks of 2+ MRs from status.json, layers bottom to top. A layer without a
// review file yet has slug null.
function buildStacks(status) {
  const byId = new Map();
  for (const mr of status?.mrs ?? []) {
    if (mr.kind !== 'review' || !mr.stack) continue;
    if (!byId.has(mr.stack.id)) byId.set(mr.stack.id, { id: mr.stack.id, baseBranch: mr.stack.baseBranch, layers: [] });
    byId.get(mr.stack.id).layers.push({
      iid: mr.iid,
      title: mr.title,
      webUrl: mr.web_url,
      slug: mr.reviewPath ? mr.reviewPath.split('/').pop().replace(/\.md$/, '') : null,
      status: mr.status,
      parentIid: mr.stack.parentIid,
      position: mr.stack.position,
    });
  }
  return [...byId.values()].map((st) => ({ ...st, layers: st.layers.sort((a, b) => a.position - b.position) }));
}

// Where an MR stands for me is read from GitLab by the poll. After an action here (a comment, a
// submitted review, a deleted draft) that one MR is read again at once, so Home moves it without
// waiting for the next poll. The newer of the two readings is the one shown.
const stateOverrides = new Map();
const newerState = (a, b) => (a && b ? (Date.parse(a.computedAt) >= Date.parse(b.computedAt) ? a : b) : a ?? b ?? null);
function refreshState(mr) {
  fetchReviewState(mr)
    .then((state) => {
      stateOverrides.set(mr.iid, state);
      broadcast();
    })
    .catch((err) => console.warn(`[studio] could not refresh where !${mr.iid} stands: ${String(err.message).slice(0, 120)}`));
}

async function listReviews() {
  // Checked against GitLab in the background (a round trip per posted comment): the list must not wait
  // for it. When it changes something, the page is told and loads the list again.
  void reconcilePosted();
  const status = await readStatus();
  const byPath = new Map((status?.mrs ?? []).map((mr) => [mr.reviewPath, mr]));
  const lastRuns = await lastRunsByMr();
  const sessions = await lastSessionByMr();
  // The resume command is a convenience: a folder git can't list must not take the whole list down.
  const worktrees = perMrWorktrees ? await listWorktrees().catch(() => []) : [];
  const workdirOf = (mr) => (perMrWorktrees ? existingWorktree(mr, worktrees)?.path : BOT_WORKTREE_DIR);
  let names = [];
  try {
    names = (await readdir(REVIEWS_DIR)).filter((n) => n.endsWith('.md'));
  } catch {
    /* reviews dir not created yet */
  }
  const items = await Promise.all(names.map(async (name) => {
    const slug = name.slice(0, -3);
    const path = join(REVIEWS_DIR, name);
    const [md, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    const shape = await loadShape(REVIEWS_DIR, slug, md);
    const mr = byPath.get(path);
    const title = md.match(/^#\s+(.+)$/m)?.[1] ?? null;
    return {
      slug,
      kind: kindOf(slug),
      title: mr?.title ?? title ?? slug,
      iid: mr?.iid ?? md.match(/\bMR:?\s*!(\d+)/i)?.[1] ?? md.match(/\bMR !(\d+)/)?.[1] ?? null,
      author: mr?.author ?? null,
      webUrl: mr?.web_url ?? null,
      branch: md.match(/\*\*Branch:\*\*\s*([^\s|]+)/)?.[1] ?? null,
      ...listFields(shape),
      stackId: mr?.stack?.id ?? null,
      crossLayer: parseAcrossLayers(md),
      // Reviewed before, but the commit (or the layer below) moved since.
      stale: mr?.status === 'pending' && Boolean(mr?.reviewedAt),
      mtime: st.mtime.toISOString(),
      reviewedAt: mr?.reviewedAt ?? st.mtime.toISOString(),
      // Resumes the Claude session of the latest run on this MR, where it ran.
      resumeCommand: mr && sessions[mr.iid] && workdirOf(mr) ? `cd ${JSON.stringify(workdirOf(mr))} && claude --resume ${sessions[mr.iid]}` : null,
      tracked: Boolean(mr),
      jira: mr?.jira ?? null,
      lastDeepAt: (mr && lastRuns[mr.iid]?.deepen) ?? null,
      lastQaAt: (mr && lastRuns[mr.iid]?.qa) ?? null,
      myState: newerState(mr?.myState ?? null, mr ? stateOverrides.get(mr.iid) ?? null : null),
    };
  }));
  items.sort(byPriorityThenDate);
  // https://host/group/project, from any tracked MR url; used to link !123 and file paths.
  const projectUrl = (status?.mrs ?? []).map((mr) => mr.web_url?.match(/^(.*)\/-\/merge_requests\/\d+/)?.[1]).find(Boolean) ?? null;
  return { status, items, stacks: buildStacks(status), projectUrl, jiraBaseUrl: JIRA_BASE_URL ? JIRA_BASE_URL.replace(/\/+$/, '') : null, settings: loadSettings(), settingsDefaults: envDefaults(), allowPosting: ALLOW_POSTING === 'true', allowPush: ALLOW_PUSH === 'true', ideEnabled: Boolean(IDE_COMMAND.trim()), diffInIdeEnabled: perMrWorktrees && Boolean(IDE_FOLDER_COMMAND.trim()), deepenEnabled: actionEnabled('deepen'), qaEnabled: actionEnabled('qa'), ticketsEnabled, posted: await loadPosted() };
}

// The suggested tickets are the factory's: read from its studio, shown as they are,
// acted on over there. When the factory is down, the tab simply has none.
async function factorySuggestions() {
  try {
    const res = await fetch(`${FACTORY_URL.replace(/\/+$/, '')}/api/tickets`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { enabled: false };
    const { suggestions } = await res.json();
    return suggestions?.enabled ? { ...suggestions, canPost: false, studio: `${FACTORY_URL.replace(/\/+$/, '')}/#/tickets` } : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

// Tickets tab: what the poller last wrote to tickets.json, and the moves to
// the final status it made (or could not make).
async function listTickets() {
  let data = null;
  try {
    data = JSON.parse(await readFile(TICKETS_FILE, 'utf8'));
  } catch {
    /* not fetched yet */
  }
  return { enabled: ticketsEnabled, autoDone: autoDoneEnabled, data, done: await readDoneLog(), suggestions: await factorySuggestions() };
}

const clients = new Set();
let debounce = null;
function broadcast() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    for (const res of clients) res.write('data: changed\n\n');
  }, 150);
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname);
  const file = join(DIST, rel);
  if (!file.startsWith(DIST)) return json(res, 400, { error: 'bad path' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // SPA fallback; if the app isn't built yet, say so.
    try {
      const body = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body);
    } catch {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Studio not built: run `npm run studio:build`.');
    }
  }
}

// Write endpoints (PUT /api/settings, POST /api/post, POST /api/action). Guarded against other
// web pages hitting localhost: Host must be us (DNS rebinding), Origin must be
// us when present, and the body must be JSON (a cross-origin JSON request needs
// a CORS preflight we don't answer).
const OWN_HOSTS = new Set([`localhost:${STUDIO_PORT}`, `127.0.0.1:${STUDIO_PORT}`]);
function isOwnOrigin(req) {
  const origin = req.headers.origin;
  return OWN_HOSTS.has(req.headers.host ?? '') && !(origin && !OWN_HOSTS.has(origin.replace(/^https?:\/\//, '')));
}
async function readJsonBody(req, res) {
  if (!isOwnOrigin(req)) {
    json(res, 403, { error: 'forbidden' });
    return null;
  }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    json(res, 415, { error: 'expected application/json' });
    return null;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) {
      json(res, 413, { error: 'too large' });
      return null;
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'invalid JSON' });
    return null;
  }
}

async function putSettings(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return undefined;
  try {
    return json(res, 200, { settings: await saveSettings(body), defaults: envDefaults() });
  } catch (err) {
    return json(res, 400, { error: String(err.message) });
  }
}

// Set by the poller, which owns the bot worktree: the studio only asks.
let actionHandler = null;
export function setActionHandler(fn) {
  actionHandler = fn;
}
const ACTION_COMMANDS = { deepen: DEEPEN_COMMAND, qa: QA_COMMAND };
const actionEnabled = (kind) => Boolean(ACTION_COMMANDS[kind] && actionHandler);

// Queues an on-demand run ("deepen" or "qa") on the MR tracked for that
// review. Nothing is posted: the result lands in the review file.
async function runAction(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  if (!Object.hasOwn(ACTION_COMMANDS, input.action)) return json(res, 400, { error: 'unknown action' });
  if (!actionEnabled(input.action)) return json(res, 403, { error: `${input.action} is disabled (its command is empty)` });
  if (typeof input.slug !== 'string' || !SLUG_RE.test(input.slug)) return json(res, 400, { error: 'bad slug' });
  const status = await readStatus();
  const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${input.slug}.md`));
  if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
  return json(res, 202, { iid: mr.iid, state: actionHandler(mr.iid, input.action) });
}

// Serialized so two quick clicks can't both pass the "already posted" check.
let postQueue = Promise.resolve();

// Posts { slug, commentId, body, path?, line? } on the MR tracked for that
// review: inline on path:line when given, else (or if GitLab refuses the
// anchor) as a general comment. The MR is resolved server-side from status.json, never taken
// from the request, so the client can't aim it at another MR.
async function postComment(req, res) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, commentId, body, path, line } = input;
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || typeof commentId !== 'string' || !/^[\w-]{1,64}$/.test(commentId)) {
    return json(res, 400, { error: 'bad slug or commentId' });
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 10_000) {
    return json(res, 400, { error: 'body must be a non-empty string under 10000 characters' });
  }
  const hasTarget = path !== undefined || line !== undefined;
  if (hasTarget && (typeof path !== 'string' || !path || path.length > 500 || path.includes('\0') || (line !== undefined && (!Number.isInteger(line) || line < 1)))) {
    return json(res, 400, { error: 'bad path or line' });
  }
  const run = postQueue.then(async () => {
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const posted = await loadPosted();
    const key = `${slug}:${commentId}`;
    if (posted[key]) return json(res, 409, { error: 'already posted', posted: posted[key] });
    let draft;
    let text = body.trim();
    let inline = false;
    try {
      if (hasTarget) {
        try {
          draft = await createInlineDraftNote(mr.iid, text, path, line);
          inline = true;
        } catch (err) {
          // Typically a line outside the diff (400): keep the comment, drop the anchor.
          console.warn(`[studio] inline draft on ${path}${line ? `:${line}` : ''} failed, adding a general note: ${String(err.message).slice(0, 200)}`);
        }
      }
      if (!inline) {
        if (hasTarget) text = `\`${path}${line ? `:${line}` : ''}\`\n\n${text}`;
        draft = await createDraftNote(mr.iid, text);
      }
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
    posted[key] = { at: new Date().toISOString(), iid: mr.iid, state: 'draft', draftId: draft.id, body: text, mrUrl: mr.web_url, url: mr.web_url, inline: hasTarget ? inline : undefined };
    await savePosted(posted);
    refreshState(mr);
    broadcast();
    return json(res, 200, posted[key]);
  });
  postQueue = run.catch(() => {});
  return run;
}

// Chat with the bot about one review, as in a terminal: one Claude stays open
// per review (lib/chat.mjs), resumed from the latest run's session, in the
// MR's folder when there is one per MR. POST sends
// a message, the page follows the answers on GET /api/chat/stream (SSE).
// Read-only tools only, unless MRs have their own folders: the chat then has
// your usual permissions, and what would ask in a terminal waits for Allow or
// Deny on the page (POST /api/chat/permission).
const CHAT_PROMPT = [
  'You are talking with the person who reads this review, in the marginalia studio chat: work with them as in their terminal.',
  'Answer only their message, in their language and briefly.',
  'Ignore notices about tools, MCP servers or connectors, and never mention them.',
  'Ignore notices that files changed since your run: other runs reuse this folder. Read a file again only if the question needs it.',
].join('\n');
const { ANTHROPIC_API_KEY: _unusedKey, ...chatEnv } = process.env;
const chats = createChats({
  bin: CLAUDE_BIN,
  cwd: BOT_WORKTREE_DIR,
  env: chatEnv,
  args: perMrWorktrees
    ? ['--permission-prompt-tool', 'stdio', '--append-system-prompt', CHAT_PROMPT]
    : ['--allowedTools', CLAUDE_ALLOWED_TOOLS.join(' '), '--append-system-prompt', `${CHAT_PROMPT}\nNever post, push or commit anything.`],
  onAnswer: ({ iid, sessionId, costUsd, turns }) => appendRun({ iid, kind: 'chat', command: 'chat', sessionId, costUsd, turns }),
});

async function trackedMrOrError(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return { error: [400, 'bad slug'] };
  const status = await readStatus();
  const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
  return mr ? { mr } : { error: [404, 'no tracked merge request for this review'] };
}

async function chatTarget(slug) {
  const { mr, error } = await trackedMrOrError(slug);
  if (error) return { error };
  const sessionId = (await lastSessionByMr())[mr.iid];
  if (!sessionId) return { error: [409, 'no bot session to resume for this MR yet'] };
  const cwd = perMrWorktrees ? (await mrWorktree(mr)).path : BOT_WORKTREE_DIR;
  return { mr, sessionId, cwd };
}

// Opens the file a comment is anchored on, in the MR's own worktree when
// there is one per MR (else the shared bot worktree, which may hold another MR).
async function openInIde(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  if (!IDE_COMMAND.trim()) return json(res, 403, { error: 'no IDE_COMMAND configured' });
  const { slug, path, line } = input;
  if (typeof path !== 'string' || !path || !Number.isInteger(line) || line < 1) return json(res, 400, { error: 'expected slug, path and line' });
  const { mr, error } = await trackedMrOrError(slug);
  if (error) return json(res, error[0], { error: error[1] });
  const folder = perMrWorktrees ? (await mrWorktree(mr)).path : BOT_WORKTREE_DIR;
  const file = resolve(folder, path);
  if (!file.startsWith(`${folder}${sep}`)) return json(res, 400, { error: 'path outside the worktree' });
  if (!(await fileExists(file))) return json(res, 404, { error: `${path} does not exist in ${folder}` });
  const fill = (arg) => arg.replaceAll('{folder}', folder).replaceAll('{file}', file).replaceAll('{line}', String(line));
  const [bin, ...args] = IDE_COMMAND.trim().split(/\s+/).map(fill);
  try {
    await execFileAsync(bin, args);
  } catch (err) {
    return json(res, 502, { error: String(err.message).slice(0, 300) });
  }
  return json(res, 200, { ok: true, folder, file, line });
}

// Opens the MR's worktree with its changes shown as uncommitted, for the IDE's
// source control view. Your own worktree is only opened: its commits are yours.
async function showDiffInIde(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  if (!perMrWorktrees || !IDE_FOLDER_COMMAND.trim()) return json(res, 403, { error: 'needs MR_WORKTREES_DIR and IDE_FOLDER_COMMAND' });
  const { mr, error } = await trackedMrOrError(input.slug);
  if (error) return json(res, error[0], { error: error[1] });
  const status = await readStatus();
  if (String(status?.current?.iid ?? '') === String(mr.iid)) return json(res, 409, { error: 'the bot is working in this MR folder right now, try again when it is done' });
  try {
    // The status only keeps a few fields: the sync needs the MR's target branch.
    const full = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${mr.iid}`);
    const worktree = await mrWorktree(full);
    if (worktree.owned) await uncommitOwned(worktree.path, full);
    const [bin, ...args] = IDE_FOLDER_COMMAND.trim().split(/\s+/).map((arg) => arg.replaceAll('{folder}', worktree.path));
    await execFileAsync(bin, args);
    return json(res, 200, { folder: worktree.path, owned: worktree.owned });
  } catch (err) {
    return json(res, 502, { error: String(err.message).slice(0, 300) });
  }
}

async function chat(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, message } = input;
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return json(res, 400, { error: 'message must be a non-empty string under 4000 characters' });
  const { mr, sessionId, cwd, error } = await chatTarget(slug);
  if (error) return json(res, error[0], { error: error[1] });
  return json(res, 202, { pending: chats.send(slug, sessionId, { iid: mr.iid, cwd }, message.trim()) });
}

async function chatPermission(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, id, allow } = input;
  if (!SLUG_RE.test(slug ?? '') || typeof id !== 'string' || typeof allow !== 'boolean') return json(res, 400, { error: 'expected slug, id and allow' });
  return chats.answer(slug, id, allow) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'no such pending permission' });
}

function chatStream(req, res, slug) {
  if (!SLUG_RE.test(slug ?? '')) return json(res, 400, { error: 'bad slug' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'hello', pending: chats.pending(slug), asks: chats.asks(slug) })}\n\n`);
  const stop = chats.listen(slug, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
  req.on('close', stop);
  return undefined;
}

// Replies { slug, discussionId, body } to a thread of the tracked MR, as a draft
// of the pending review. The discussion must belong to that MR: GitLab rejects
// an id from another one, and the MR itself comes from status.json.
// Submits the drafts of one review as a real GitLab review, with an optional
// summary note and an `action` (comment, approve, request_changes). Like
// postComment(), the MR comes from status.json.
async function submitReview(req, res) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, summary } = input;
  const action = parseReviewAction(input.action);
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return json(res, 400, { error: 'bad slug' });
  if (!action) return json(res, 400, { error: 'action must be comment, approve or request_changes' });
  if (summary !== undefined && (typeof summary !== 'string' || summary.length > 10_000)) return json(res, 400, { error: 'summary must be a string under 10000 characters' });
  const run = postQueue.then(async () => {
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const posted = await loadPosted();
    const drafts = Object.entries(posted).filter(([key, info]) => key.startsWith(`${slug}:`) && info.state === 'draft');
    const text = summary?.trim();
    // Approving or requesting changes needs no comment: the verdict is the review.
    if (!drafts.length && !text && action === 'comment') return json(res, 400, { error: 'nothing to submit' });
    try {
      if (text) await createDraftNote(mr.iid, text);
      // Drafts started in GitLab itself are not in posted.json: ask GitLab.
      const pending = drafts.length > 0 || Boolean(text) || (await listDraftNotes(mr.iid)).length > 0;
      if (pending || action === 'request_changes') await publishDraftNotes(mr.iid, reviewerStateFor(action));
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
    let approveError = null;
    if (action === 'approve') {
      try {
        await approveMergeRequest(mr.iid, (await loadState())[mr.iid]);
      } catch (err) {
        approveError = String(err.message).slice(0, 300);
      }
    }
    for (const [key, info] of drafts) {
      let noteId = null;
      try {
        noteId = await findPublishedNoteId(info.iid, info.body);
      } catch {
        /* the review is out; only the deep link is missing */
      }
      const { draftId, ...rest } = info;
      posted[key] = { ...rest, state: 'published', at: new Date().toISOString(), url: noteId ? `${info.mrUrl}#note_${noteId}` : info.mrUrl };
    }
    await savePosted(posted);
    refreshState(mr);
    broadcast();
    // The comments are out either way: say so, so the user does not submit them twice.
    if (approveError) return json(res, 502, { error: `Comments published, but the approval failed: ${approveError}` });
    return json(res, 200, { submitted: drafts.length, summary: Boolean(text), action });
  });
  postQueue = run.catch(() => {});
  return run;
}

// Edits (PUT, { body }) or deletes (DELETE) one pending draft of a tracked review,
// including drafts started in GitLab itself. The draft is addressed under the MR
// resolved from status.json, so it can't reach another MR's drafts.
async function mutateDraft(req, res, pathname) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  if (!isOwnOrigin(req)) return json(res, 403, { error: 'forbidden' });
  const [, slugPart, idPart] = pathname.match(/^\/api\/drafts\/([^/]+)\/(\d{1,12})$/) ?? [];
  let slug;
  try {
    slug = decodeURIComponent(slugPart ?? '');
  } catch {
    slug = '';
  }
  if (!SLUG_RE.test(slug) || slug.includes('..') || !idPart) return json(res, 400, { error: 'bad slug or draft id' });
  const draftId = Number(idPart);
  let text;
  if (req.method === 'PUT') {
    const input = await readJsonBody(req, res);
    if (input === null) return undefined;
    text = typeof input.body === 'string' ? input.body.trim() : '';
    if (!text || text.length > 10_000) return json(res, 400, { error: 'body must be a non-empty string under 10000 characters' });
  }
  const run = postQueue.then(async () => {
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      if (req.method === 'PUT') await updateDraftNote(mr.iid, draftId, text);
      else await deleteDraftNote(mr.iid, draftId);
    } catch (err) {
      return json(res, / -> 404:/.test(String(err.message)) ? 404 : 502, { error: String(err.message).slice(0, 300) });
    }
    // Keep the local record in step: a deleted draft can be added again, an edited one keeps its new text for matching.
    const posted = await loadPosted();
    const entry = Object.entries(posted).find(([, info]) => info.state === 'draft' && info.draftId === draftId && info.iid === mr.iid);
    if (entry) {
      if (req.method === 'DELETE') delete posted[entry[0]];
      else posted[entry[0]] = { ...entry[1], body: text };
      await savePosted(posted);
    }
    refreshState(mr);
    broadcast();
    return json(res, 200, { ok: true });
  });
  postQueue = run.catch(() => {});
  return run;
}


// Re-runs the review (or the comment triage, for my own MRs) of one tracked MR. The
// poller skips an MR whose recorded SHA matches its head, so the entry is set to
// null (not deleted: an absent entry would let it trust an existing review file)
// and the poller is nudged with SIGUSR1, the same signal as the menu bar's "Poll now".
// state.json is only edited while the poller is idle: a running poll holds its own
// copy of the state in memory and would overwrite the change when it saves.
async function rerunReview(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug } = input;
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
  const status = await readStatus();
  const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
  if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
  let alive = false;
  try {
    alive = Boolean(status?.pid) && process.kill(status.pid, 0);
  } catch {
    /* no such process */
  }
  if (!alive || status.phase === 'stopped') return json(res, 409, { error: 'the bot is not running: start it with npm start' });
  if (status.phase !== 'idle' && status.phase !== 'error') return json(res, 409, { error: 'a run is in progress, try again when it is done' });
  const state = await loadState();
  if (mr.kind === 'comments') (state.mineComments ??= {})[mr.iid] = null;
  else state[mr.iid] = null;
  await saveState(state);
  process.kill(status.pid, 'SIGUSR1');
  return json(res, 200, { ok: true, iid: mr.iid, kind: mr.kind });
}

// The tracked MR of a triage, as fixesStatus() wants it, or null.
async function triagedMr(slug) {
  const mr = await trackedMr(slug);
  return mr?.kind === 'comments' && mr.sourceBranch ? { iid: mr.iid, source_branch: mr.sourceBranch } : null;
}

// Pushes the local fixes of one triage to its MR branch, only if that branch hasn't
// moved since (fast-forward). Serialized so two clicks can't race on the same push.
let pushQueue = Promise.resolve();
async function pushTriageFixes(req, res) {
  if (ALLOW_PUSH !== 'true') return json(res, 403, { error: 'pushing is disabled (ALLOW_PUSH=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug } = input;
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
  const run = pushQueue.then(async () => {
    const mr = await triagedMr(slug);
    if (!mr) return json(res, 404, { error: 'no tracked triage for this slug' });
    try {
      const { pushed, status } = await pushFixes(mr);
      if (!pushed) return json(res, 409, { error: status.state === 'outdated' ? 'the MR branch moved since the triage: re-run it' : `nothing to push (${status.state})`, status });
      return json(res, 200, status);
    } catch (err) {
      return json(res, 502, { error: String(err.stderr || err.message).trim().slice(0, 300) });
    }
  });
  pushQueue = run.catch(() => {});
  return run;
}

async function handle(req, res) {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (req.method === 'PUT' && pathname === '/api/settings') return putSettings(req, res);
  if (req.method === 'POST' && pathname === '/api/post') return postComment(req, res);
  if (req.method === 'POST' && pathname === '/api/action') return runAction(req, res);
  if (req.method === 'POST' && pathname === '/api/chat') return chat(req, res);
  if (req.method === 'POST' && pathname === '/api/chat/permission') return chatPermission(req, res);
  if (req.method === 'POST' && pathname === '/api/open-in-ide') return openInIde(req, res);
  if (req.method === 'POST' && pathname === '/api/show-diff-in-ide') return showDiffInIde(req, res);
  if (req.method === 'POST' && pathname === '/api/submit-review') return submitReview(req, res);
  if (req.method === 'POST' && pathname === '/api/rerun') return rerunReview(req, res);
  if (req.method === 'POST' && pathname === '/api/push') return pushTriageFixes(req, res);
  if ((req.method === 'PUT' || req.method === 'DELETE') && pathname.startsWith('/api/drafts/')) return mutateDraft(req, res, pathname);
  if (req.method !== 'GET') return json(res, 405, { error: 'read-only' });
  if (pathname === '/api/chat/stream') return chatStream(req, res, new URL(req.url, 'http://localhost').searchParams.get('slug'));

  if (pathname === '/api/reviews') return json(res, 200, await listReviews());
  if (pathname === '/api/tickets') return json(res, 200, await listTickets());

  // Previous versions of a review (/api/history/:slug) and one of them (/api/history/:slug/:id).
  if (pathname.startsWith('/api/history/')) {
    const [slugPart, idPart] = pathname.slice('/api/history/'.length).split('/');
    let slug;
    try {
      slug = decodeURIComponent(slugPart ?? '');
    } catch {
      slug = '';
    }
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    if (!idPart) return json(res, 200, { versions: await listHistory(slug) });
    const version = await readHistory(slug, idPart);
    if (version === null) return json(res, 404, { error: 'not found' });
    return json(res, 200, { slug, id: idPart, markdown: version.markdown, shape: version.shape ?? buildShape({ markdown: version.markdown }) });
  }

  // The MR's GitLab conversation, for the studio's discussion panel.
  if (pathname.startsWith('/api/drafts/')) {
    if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
    let slug;
    try {
      slug = decodeURIComponent(pathname.slice('/api/drafts/'.length));
    } catch {
      return json(res, 400, { error: 'bad slug' });
    }
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      return json(res, 200, { drafts: await listDraftNotes(mr.iid) });
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  }

  const threadsMatch = /^\/api\/reviews\/([^/]+)\/threads$/.exec(pathname);
  if (threadsMatch) {
    const slug = decodeURIComponent(threadsMatch[1]);
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    const mr = await trackedMr(slug);
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      return json(res, 200, { threads: await reviewThreads(mr) });
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  }

  const diffMatch = /^\/api\/reviews\/([^/]+)\/diff$/.exec(pathname);
  if (diffMatch) {
    const slug = decodeURIComponent(diffMatch[1]);
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    const mr = await trackedMr(slug);
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const versionId = searchParams.get('version');
    const mode = searchParams.get('mode') === 'since' ? 'since' : 'full';
    if (versionId && !/^[\w-]+$/.test(versionId)) return json(res, 400, { error: 'bad version' });
    try {
      // The live diff, unless it is about what an earlier review saw or what changed since it.
      if (versionId || mode === 'since') {
        const { status, ...body } = await reviewDiff(mr, slug, { versionId, mode, stopId: searchParams.get('stop') });
        return json(res, status, body);
      }
      let files = (await listMergeRequestDiffs(mr.iid)).map(toDiffFile);
      const stopId = searchParams.get('stop');
      if (stopId) {
        const shape = await loadShape(REVIEWS_DIR, slug, '');
        const stop = (shape.tour ?? []).find((s) => s.id === stopId);
        files = stop ? filesForPatterns(files, stop.files) : [];
      }
      return json(res, 200, { files });
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  }

  if (pathname.startsWith('/api/reviews/')) {
    let slug;
    try {
      slug = decodeURIComponent(pathname.slice('/api/reviews/'.length));
    } catch {
      return json(res, 400, { error: 'bad slug' });
    }
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    try {
      const md = await readFile(join(REVIEWS_DIR, `${slug}.md`), 'utf8');
      return json(res, 200, { slug, kind: kindOf(slug), markdown: md, shape: await loadShape(REVIEWS_DIR, slug, md) });
    } catch {
      return json(res, 404, { error: 'not found' });
    }
  }

  if (pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }

  return serveStatic(pathname, res);
}

export function startStudio() {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => json(res, 500, { error: String(err.message ?? err) }));
  });
  server.on('error', (err) => console.error(`[studio] ${err.code === 'EADDRINUSE' ? `port ${STUDIO_PORT} already in use` : err.message}`));
  server.listen(Number(STUDIO_PORT), '127.0.0.1', () => {
    console.log(`[studio] http://localhost:${STUDIO_PORT}`);
  });
  // Closed with the server, so it can be stopped cleanly (tests start and stop it).
  const watchers = [];
  try {
    watchers.push(watch(REVIEWS_DIR, broadcast));
  } catch {
    /* dir may not exist yet; the poller creates it, SSE just stays quiet */
  }
  // Watch the directory, not the files: status.json and settings.json are
  // written via tmp + rename, which leaves a file-level watcher on the old inode.
  try {
    watchers.push(watch(dirname(STATUS_FILE), (_e, name) => (name === 'settings.json' || name === 'status.json' || name === 'tickets.json' || name === 'jira-done.jsonl') && broadcast()));
  } catch {
    /* same */
  }
  server.on('close', () => {
    for (const w of watchers) w.close();
    for (const res of clients) res.end();
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startStudio();
