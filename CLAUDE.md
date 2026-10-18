# Marginalia — rules for AI agents

## Module size in `lib/`

- No module in `lib/` may exceed **150 lines** (`MAX_LINES` in `scripts/check-file-size.mjs`).
- It is enforced three ways: a `PostToolUse` hook (`.claude/settings.json`) that rejects an edit
  leaving a `lib/` file over the limit, `test/file-size.test.mjs` in `npm test`, and
  `npm run check:size`.
- When a module gets close to the limit, split it by responsibility rather than compacting it:
  pure logic (parsing, mapping, building payloads) in its own module with no config or I/O import,
  so it can be unit-tested on plain fixtures; requests and side effects in another.
  Existing examples: `gitlab-notes.mjs` (pure) / `gitlab.mjs` + `gitlab-drafts.mjs` (requests),
  `claude-cli.mjs` (pure) / `claude-runner.mjs` (flow), `findings-*.mjs` behind `findings.mjs`.
- Import a function from the module that defines it; only `findings.mjs` re-exports, as the
  public entry point of the findings shape.
- Do not raise the limit to make a change fit.
