import { spawn } from 'node:child_process';
import { describeStep } from './progress.mjs';

// One Claude kept open per discussion, like a terminal: it resumes the bot's
// session once, then receives each message on its stdin, so a message costs
// only its own turn and can be sent while the previous one is being answered
// (it is handled right after). Events go to every page listening to that key.
const IDLE_MS = 15 * 60 * 1000;

export function createChats({ bin, cwd, env, args, onAnswer = () => {} }) {
  const chats = new Map(); // key -> running Claude
  const listeners = new Map(); // key -> Set of listeners, independent of the process

  function emit(key, event) {
    for (const listen of listeners.get(key) ?? []) listen(event);
  }

  function close(key) {
    const chat = chats.get(key);
    if (!chat) return;
    chats.delete(key);
    clearTimeout(chat.idle);
    chat.child.stdin.end();
    emit(key, { type: 'closed', pending: 0 });
  }

  function open(key, sessionId, meta) {
    const child = spawn(bin, ['--resume', sessionId, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', ...args], {
      cwd: meta.cwd ?? cwd, env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chat = { child, pending: 0, spent: 0, idle: null, stderr: '' };
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === 'assistant') {
          for (const block of event.message?.content ?? []) {
            const step = describeStep(block);
            if (step) emit(key, { type: 'step', text: step, pending: chat.pending });
          }
        }
        if (event.type === 'result') {
          // total_cost_usd adds up over the process: the turn costs the difference.
          const total = Number(event.total_cost_usd ?? 0);
          const costUsd = total - chat.spent;
          chat.spent = total;
          chat.pending = Math.max(0, chat.pending - 1);
          emit(key, { type: event.is_error ? 'error' : 'answer', text: event.result ?? '', costUsd, pending: chat.pending });
          onAnswer({ ...meta, sessionId: event.session_id, costUsd, turns: event.num_turns ?? 0 });
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      chat.stderr = (chat.stderr + chunk).slice(-2000);
    });
    child.on('close', (code) => {
      if (chats.get(key) !== chat) return;
      chats.delete(key);
      clearTimeout(chat.idle);
      emit(key, code ? { type: 'error', text: `The bot stopped (code ${code}): ${chat.stderr.slice(0, 300)}`, pending: 0 } : { type: 'closed', pending: 0 });
    });
    chats.set(key, chat);
    return chat;
  }

  return {
    // Sends a message, opening the discussion on first use. Returns how many
    // messages wait for an answer, this one included.
    send(key, sessionId, meta, message) {
      const chat = chats.get(key) ?? open(key, sessionId, meta);
      chat.pending += 1;
      clearTimeout(chat.idle);
      chat.idle = setTimeout(() => close(key), IDLE_MS);
      chat.child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: message } })}\n`);
      emit(key, { type: 'queued', pending: chat.pending });
      return chat.pending;
    },
    listen(key, listener) {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
    pending(key) {
      return chats.get(key)?.pending ?? 0;
    },
    close,
  };
}
