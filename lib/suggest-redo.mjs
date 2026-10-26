// Contested drafts already in the list go back through the rewrite loop, in place: the
// verifier's objections return to the writer, the item keeps its id and its status.
import { readFile } from 'node:fs/promises';
import { SUGGEST_VERIFY_MODEL, SUGGEST_REWRITE_ROUNDS, suggestTemplateFile } from './suggest-config.mjs';
import { ask, freshWorktree, readSuggestions, updateSuggestions } from './suggest.mjs';
import { buildVerifyPrompt, parseVerdict } from './suggest-prompt.mjs';
import { buildRewritePrompt, parseOneSuggestion, reviseUntilClean } from './suggest-revise.mjs';

export const contested = (items) => items.filter((s) => s.status === 'new' && s.check && !s.check.ok);

const REWRITTEN = ['title', 'principle', 'files', 'why', 'body', 'sha', 'check', 'revisedAt'];
// Only the rewritten fields land on the stored item: a Keep clicked during the loop is not undone.
export function mergeRevised(items, revised) {
  const byId = new Map(revised.map((s) => [s.id, s]));
  return items.map((s) => {
    const r = byId.get(s.id);
    return r ? { ...s, ...Object.fromEntries(REWRITTEN.map((k) => [k, r[k]])) } : s;
  });
}

let revising = null;
export const isRevising = () => Boolean(revising);

// A second click while it runs joins the run.
export function reviseContested() {
  revising ??= (async () => {
    try {
      const started = new Date().toISOString();
      const targets = contested((await readSuggestions()).items);
      if (!targets.length || !SUGGEST_VERIFY_MODEL) return [];
      const [{ sha }, template] = await Promise.all([freshWorktree(), readFile(suggestTemplateFile, 'utf8').catch(() => '')]);
      let spent = 0;
      const paid = (p) => p.then((r) => { spent += r.costUsd; return r.text; });
      const verify = (d) => paid(ask(buildVerifyPrompt(d), SUGGEST_VERIFY_MODEL).catch(() => ({ text: '', costUsd: 0 }))).then(parseVerdict);
      const write = (d, problems) => paid(ask(buildRewritePrompt(d, problems, template))).then(parseOneSuggestion);
      const revised = await Promise.all(targets.map(async (s) => {
        const { draft, check } = await reviseUntilClean(s, { write, verify, rounds: Number(SUGGEST_REWRITE_ROUNDS) });
        return { ...draft, sha, check, revisedAt: started };
      }));
      const lastRevise = { at: started, count: revised.length, clean: revised.filter((s) => s.check.ok).length, costUsd: spent };
      await updateSuggestions((latest) => ({ ...latest, lastRevise, items: mergeRevised(latest.items, revised) }));
      return revised;
    } finally {
      revising = null;
    }
  })();
  return revising;
}
