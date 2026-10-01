import './lib/node-check.mjs';
import { mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { GITLAB_USERNAME, TRIAGE_COMMAND, allowedTargets, REVIEWS_DIR, ROOT, encodedProjectId } from './lib/config.mjs';
import { loadSettings, pollIntervalMs } from './lib/settings.mjs';
import { startStudio, setActionHandler } from './studio/server.mjs';
import { isFancyTerminal, c, timestamp, log, mrTag } from './lib/log.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { status, writeStatus, setMrStatus } from './lib/status.mjs';
import { notify } from './lib/notify.mjs';
import { gitlabRequest, listOpenMergeRequests, reviewFileCoversLastPush, latestPeerCommentAt } from './lib/gitlab.mjs';
import { reviewOutputPath, mrCommentsOutputPath, mtimeOrNull } from './lib/paths.mjs';
import { ensureBotWorktree } from './lib/worktree.mjs';
import { runReview, runMrComments, runDeepen } from './lib/claude-runner.mjs';
import { analyzeStacks } from './lib/stack.mjs';

async function poll() {
  const ts = timestamp();
  console.log(`${ts} ${c.bold}${c.cyan}Polling open MRs...${c.reset}`);
  status.phase = 'polling';
  await writeStatus();
  const state = await loadState();
  state.mineComments ??= {};
  state.stackBelow ??= {};
  const openMrs = await listOpenMergeRequests();
  // A stacked MR targets the branch of the MR below it, so the allowed-targets
  // filter looks at the branch the whole stack is based on.
  const stacks = analyzeStacks(openMrs);
  const openByIid = new Map(openMrs.map((mr) => [mr.iid, mr]));
  const allMrs = allowedTargets.length
    ? openMrs.filter((mr) => allowedTargets.includes(stacks.get(mr.iid).baseBranch))
    : openMrs;
  const stackInfo = (mr) => {
    const info = stacks.get(mr.iid);
    return info && info.size > 1 ? info : null;
  };
  const parentOf = (mr) => openByIid.get(stacks.get(mr.iid)?.parentIid) ?? null;
  // Reviewed at this commit, and the layer below hasn't moved since.
  const isCurrent = (mr) => state[mr.iid] === mr.sha && (parentOf(mr) === null || state.stackBelow[mr.iid] === parentOf(mr).sha);

  // MRs authored by someone else go through /code-review as before; MRs I
  // authored myself get their reviewer comments triaged via /mr-comments.
  // Bottom layers first, so a layer is reviewed after the ones it builds on.
  const reviewMrs = allMrs
    .filter((mr) => mr.author.username !== GITLAB_USERNAME)
    .sort((a, b) => stacks.get(a.iid).depth - stacks.get(b.iid).depth);
  const myMrs = TRIAGE_COMMAND ? allMrs.filter((mr) => mr.author.username === GITLAB_USERNAME) : [];

  const toReview = reviewMrs.filter((mr) => !isCurrent(mr));
  const peerCommentAts = await Promise.all(myMrs.map((mr) => latestPeerCommentAt(mr)));
  const myMrsWithSignal = myMrs.map((mr, i) => ({ mr, peerCommentAt: peerCommentAts[i] }));
  const toTriage = myMrsWithSignal.filter(
    ({ mr, peerCommentAt }) => peerCommentAt !== null && state.mineComments[mr.iid] !== peerCommentAt,
  );

  // The review/report file's mtime doubles as "last reviewed at", so files
  // written by hand or before this field existed get a date too.
  const reviewedAts = await Promise.all(reviewMrs.map((mr) => mtimeOrNull(reviewOutputPath(mr))));
  const triagedAts = await Promise.all(myMrs.map((mr) => mtimeOrNull(mrCommentsOutputPath(mr))));
  status.mrs = [
    ...reviewMrs.map((mr, i) => ({
      iid: mr.iid,
      title: mr.title,
      web_url: mr.web_url,
      author: mr.author.username,
      kind: 'review',
      status: isCurrent(mr) ? 'up_to_date' : 'pending',
      targetBranch: mr.target_branch,
      sourceBranch: mr.source_branch,
      stack: stackInfo(mr) && { id: stackInfo(mr).id, position: stackInfo(mr).position, size: stackInfo(mr).size, parentIid: stackInfo(mr).parentIid, baseBranch: stackInfo(mr).baseBranch },
      reviewPath: reviewOutputPath(mr),
      reviewedAt: reviewedAts[i] === null ? null : new Date(reviewedAts[i]).toISOString(),
      error: null,
      updatedAt: mr.updated_at,
    })),
    ...myMrsWithSignal.map(({ mr, peerCommentAt }, i) => ({
      iid: mr.iid,
      title: mr.title,
      web_url: mr.web_url,
      author: mr.author.username,
      kind: 'comments',
      // No peer comment at all counts as "up to date": there is nothing to triage yet.
      status: peerCommentAt === null || state.mineComments[mr.iid] === peerCommentAt ? 'up_to_date' : 'pending',
      reviewPath: mrCommentsOutputPath(mr),
      reviewedAt: triagedAts[i] === null ? null : new Date(triagedAts[i]).toISOString(),
      error: null,
      updatedAt: mr.updated_at,
    })),
  ];
  markQueued();
  await writeStatus();
  const needCount = toReview.length + toTriage.length;
  const needColor = needCount > 0 ? c.green : c.dim;
  console.log(
    `${ts} ${c.bold}${reviewMrs.length}${c.reset} MR(s) to review, ${c.bold}${myMrs.length}${c.reset} of my own — ` +
      `${needColor}${toReview.length} need a review, ${toTriage.length} need comment triage${c.reset}.`,
  );

  // The lower layer's commit this review was made on top of; when it moves, this layer is stale.
  const recordBelow = (mr) => {
    const parent = parentOf(mr);
    if (parent) state.stackBelow[mr.iid] = parent.sha;
    else delete state.stackBelow[mr.iid];
  };

  const seenReviewIids = new Set();
  for (const mr of reviewMrs) {
    seenReviewIids.add(String(mr.iid));
    if (isCurrent(mr)) continue; // already reviewed at this commit, on top of the same lower layer

    // First time the bot ever sees this MR: if a review file already sits there
    // (written by hand via /code-review, or by a previous run of this bot before
    // state.json existed) and is newer than the last push, trust it and don't
    // redo the work. A file older than the last push predates some commits, so
    // it falls through to a real review.
    if (state[mr.iid] === undefined && (await reviewFileCoversLastPush(mr))) {
      log(mr, `A review file newer than the last push already exists at ${reviewOutputPath(mr)}, assuming it covers this commit. Skipping.`);
      state[mr.iid] = mr.sha;
      recordBelow(mr);
      await saveState(state);
      await setMrStatus(mr, { status: 'up_to_date' });
      continue;
    }

    status.phase = 'reviewing';
    status.current = { iid: mr.iid, title: mr.title, web_url: mr.web_url, startedAt: new Date().toISOString() };
    await setMrStatus(mr, { status: 'reviewing' });
    try {
      const info = stackInfo(mr);
      const outcome = await runReview(mr, reviewOutputPath(mr), info && { stacks, info });
      if (outcome === 'reviewed') {
        state[mr.iid] = mr.sha;
        recordBelow(mr);
        await saveState(state);
        await setMrStatus(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() });
        notify('Review ready', `!${mr.iid} ${mr.title}`, reviewOutputPath(mr));
      } else {
        // Not recorded in state: the next poll retries it, once the branch has
        // been switched away from in the other worktree.
        await setMrStatus(mr, { status: 'skipped', error: `Branch "${mr.source_branch}" is checked out in another worktree.` });
      }
    } catch (err) {
      console.error(`${timestamp()} ${c.red}${mrTag(mr)} Review failed:${c.reset}`, err);
      await setMrStatus(mr, { status: 'failed', error: err.message });
      notify('Review failed', `!${mr.iid} ${mr.title}`);
    } finally {
      status.phase = 'polling';
      status.current = null;
      await writeStatus();
    }
  }

  const seenMineIids = new Set();
  for (const { mr, peerCommentAt } of myMrsWithSignal) {
    seenMineIids.add(String(mr.iid));
    if (peerCommentAt === null) continue; // no peer comment yet, nothing to triage
    if (state.mineComments[mr.iid] === peerCommentAt) continue; // already triaged up to this comment

    status.phase = 'reviewing';
    status.current = { iid: mr.iid, title: mr.title, web_url: mr.web_url, startedAt: new Date().toISOString() };
    await setMrStatus(mr, { status: 'reviewing' });
    try {
      const outcome = await runMrComments(mr);
      if (outcome === 'reviewed') {
        state.mineComments[mr.iid] = peerCommentAt;
        await saveState(state);
        await setMrStatus(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() });
        notify('Comments triaged', `!${mr.iid} ${mr.title}`, mrCommentsOutputPath(mr));
      } else {
        // Not recorded in state: the next poll retries it, once the branch has
        // been switched away from in the other worktree.
        await setMrStatus(mr, { status: 'skipped', error: `Branch "${mr.source_branch}" is checked out in another worktree.` });
      }
    } catch (err) {
      console.error(`${timestamp()} ${c.red}${mrTag(mr)} Comment triage failed:${c.reset}`, err);
      await setMrStatus(mr, { status: 'failed', error: err.message });
      notify('Comment triage failed', `!${mr.iid} ${mr.title}`);
    } finally {
      status.phase = 'polling';
      status.current = null;
      await writeStatus();
    }
  }

  // Drop state for MRs that are no longer open (merged/closed) or no longer eligible.
  for (const iid of Object.keys(state)) {
    if (iid === 'mineComments' || iid === 'stackBelow') continue;
    if (!seenReviewIids.has(iid)) delete state[iid];
  }
  for (const iid of Object.keys(state.stackBelow)) {
    if (!seenReviewIids.has(iid)) delete state.stackBelow[iid];
  }
  for (const iid of Object.keys(state.mineComments)) {
    if (!seenMineIids.has(iid)) delete state.mineComments[iid];
  }
  await saveState(state);
  console.log(`${timestamp()} ${c.dim}Poll done. Next one in ${loadSettings().pollIntervalMinutes} minute(s).${c.reset}`);
}

const BANNER = [
  "                                _                _  _",
  " _ __ ___    __ _  _ __   __ _ (_) _ __    __ _ | |(_)  __ _",
  "| '_ ` _ \\  / _` || '__| / _` || || '_ \\  / _` || || | / _` |",
  "| | | | | || (_| || |   | (_| || || | | || (_| || || || (_| |",
  "|_| |_| |_| \\__,_||_|    \\__, ||_||_| |_| \\__,_||_||_| \\__,_|",
  "                         |___/",
].join('\n');

function printBanner() {
  if (!isFancyTerminal) return;
  console.log(`\n${c.cyan}${c.bold}${BANNER}${c.reset}\n`);
}

let pollTimer = null;
let isPolling = false;

// The next poll is only scheduled once this one is over: a review can take
// longer than the poll interval, and two polls must never share the bot
// worktree at the same time.
async function runPoll() {
  if (isPolling) {
    console.log(`${timestamp()} ${c.dim}A poll is already running, ignoring this request.${c.reset}`);
    return;
  }
  clearTimeout(pollTimer);
  isPolling = true;
  try {
    await poll();
    status.phase = 'idle';
    status.lastPoll = { at: new Date().toISOString(), ok: true, error: null };
  } catch (err) {
    console.error(`${timestamp()} ${c.red}Poll failed:${c.reset}`, err);
    // Only notify on the ok -> error transition, not on every failed poll.
    if (status.lastPoll?.ok !== false) notify('Marginalia error', err.message);
    status.phase = 'error';
    status.lastPoll = { at: new Date().toISOString(), ok: false, error: err.message };
  } finally {
    isPolling = false;
    status.current = null;
    scheduleNextPoll(Date.now());
    await writeStatus();
  }
  if (actionQueue.length) drainActions();
}

// On-demand runs from the studio ("Deep review"). They share the bot
// worktree with the polls, so they wait for the running poll and polls wait
// for them.
const ACTIONS = {
  deepen: { run: runDeepen, busy: 'deepening', label: 'Deep review', done: 'Deep review ready' },
};
const actionQueue = [];
let runningAction = null;

// A queued action shows on its MR ("qa-queued"...) until it starts, even across
// the poll that rebuilds the MR list.
function markQueued() {
  for (const { iid, kind } of actionQueue.filter((a) => a !== runningAction)) {
    const entry = status.mrs.find((m) => m.iid === iid);
    if (entry) entry.status = `${kind}-queued`;
  }
}

function requestAction(iid, kind) {
  if (actionQueue.some((a) => a.iid === iid && a.kind === kind)) return 'queued';
  actionQueue.push({ iid, kind });
  if (isPolling) {
    markQueued();
    writeStatus();
    return 'queued';
  }
  drainActions();
  return 'started';
}

async function drainActions() {
  if (isPolling) return;
  isPolling = true;
  try {
    while (actionQueue.length) {
      runningAction = actionQueue[0];
      const { iid, kind } = runningAction;
      const action = ACTIONS[kind];
      let mr = null;
      try {
        mr = await gitlabRequest(`/projects/${encodedProjectId}/merge_requests/${iid}`);
        status.phase = 'reviewing';
        status.current = { iid: mr.iid, title: mr.title, web_url: mr.web_url, startedAt: new Date().toISOString() };
        await setMrStatus(mr, { status: action.busy });
        const outcome = await action.run(mr);
        if (outcome === 'reviewed') {
          await setMrStatus(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() });
          notify(action.done, `!${mr.iid} ${mr.title}`, reviewOutputPath(mr));
        } else {
          await setMrStatus(mr, { status: 'skipped', error: `Branch "${mr.source_branch}" is checked out in another worktree.` });
        }
      } catch (err) {
        console.error(`${timestamp()} ${c.red}[MR !${iid}] ${action.label} failed:${c.reset}`, err);
        if (mr) await setMrStatus(mr, { status: 'failed', error: err.message });
        notify(`${action.label} failed`, `!${iid}`);
      } finally {
        actionQueue.shift();
        runningAction = null;
      }
    }
  } finally {
    isPolling = false;
    status.phase = 'idle';
    status.current = null;
    // A poll due while we held the worktree was dropped: re-arm it.
    scheduleNextPoll(Date.now());
    await writeStatus();
  }
}

// The next poll is due `interval` after the previous one *finished* (`from`).
function scheduleNextPoll(from) {
  const delay = Math.max(from + pollIntervalMs() - Date.now(), 1000);
  clearTimeout(pollTimer);
  status.nextPollAt = new Date(Date.now() + delay).toISOString();
  pollTimer = setTimeout(runPoll, delay);
}

// settings.json changes (from the studio): re-arm the pending timer so the
// new interval applies right away instead of after the next poll. While a
// poll is running, its own finally block reads the fresh value.
let settingsDebounce = null;
function watchSettings() {
  try {
    watch(ROOT, (_event, name) => {
      if (name !== 'settings.json') return;
      clearTimeout(settingsDebounce);
      settingsDebounce = setTimeout(() => {
        if (isPolling || !status.lastPoll) return;
        scheduleNextPoll(new Date(status.lastPoll.at).getTime());
        console.log(`${timestamp()} ${c.dim}Poll interval is now ${loadSettings().pollIntervalMinutes} minute(s).${c.reset}`);
        writeStatus();
      }, 200);
    });
  } catch (err) {
    console.error(`${timestamp()} Could not watch settings.json:`, err.message);
  }
}

async function shutdown() {
  clearTimeout(pollTimer);
  status.phase = 'stopped';
  status.current = null;
  status.nextPollAt = null;
  await writeStatus();
  process.exit(0);
}

async function main() {
  printBanner();
  await writeStatus();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await mkdir(REVIEWS_DIR, { recursive: true });
  setActionHandler(requestAction);
  startStudio();
  watchSettings();
  await ensureBotWorktree();
  // `kill -USR1 <pid>` (the menu bar's "Poll now") triggers a poll right away.
  process.on('SIGUSR1', runPoll);
  await runPoll();
}

main();
