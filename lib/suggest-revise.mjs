// A draft the verifier contested goes back to its writer with the objections, then is
// checked again; the loop ends on a clean verdict or after `rounds` rewrites. Pure: the
// two model calls are injected, so the loop is tested on plain functions.
import { normalizeSuggestion } from './suggest-prompt.mjs';

export function buildRewritePrompt(draft, problems, template) {
  return [
    'A second reading of the code found statements in this ticket draft that do not hold. Rewrite the draft so that every statement about the code or about what a user sees is true at this commit: correct a statement from the code (Read, Grep and Glob are available), or drop it together with any rule, criterion or question that rested on it.',
    'Keep the template and its sections, keep the title unless it is itself false, and keep the files list accurate.',
    `## Statements that do not hold\n\n${problems.map((p) => `- ${p}`).join('\n')}`,
    `## Draft\n\n### Title\n\n${draft.title}\n\n### Principle\n\n${draft.principle || 'none'}\n\n### Why\n\n${draft.why || 'none'}\n\n### Files\n\n${draft.files.join('\n') || 'none'}\n\n### Body\n\n${draft.body}`,
    template ? `## Template\n\n${template}` : '',
    'Answer with JSON only: one object {"title": "<the ticket title>", "files": ["<path:line>", "..."], "why": "<one sentence: what the user meets today and what changes>", "body": "<the whole rewritten description in markdown>"}. The principle stays as it is: it names the reference the ticket applies, not the rewrite.',
  ].filter(Boolean).join('\n\n');
}

// The rewritten draft in the model's answer; null when it cannot be read. The principle is not asked for: it is the reference the ticket applies, and a rewrite does not change it.
export function parseOneSuggestion(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const s = normalizeSuggestion(JSON.parse(text.slice(start, end + 1)));
    return s.title && s.body ? s : null;
  } catch {
    return null;
  }
}

// `verify(draft)` gives {ok, problems}; `write(draft, problems)` gives the rewritten draft or null.
export async function reviseUntilClean(draft, { write, verify, rounds }) {
  let current = draft;
  let check = await verify(current);
  let round = 0;
  while (!check.ok && round < rounds) {
    const rewritten = await write(current, check.problems);
    if (!rewritten) break;
    round += 1;
    current = { ...current, ...rewritten, principle: current.principle };
    check = await verify(current);
  }
  return { draft: current, check: { ...check, rounds: round } };
}
