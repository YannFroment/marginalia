# marginalia

Poller that watches open MRs on a GitLab project and runs **your own** Claude
Code slash commands headless (`claude -p "/your-command MR !<iid>"`) in a
worktree dedicated to the bot: one command to review MRs from others
(`REVIEW_COMMAND`), one to triage the reviewer comments on your own
(`TRIAGE_COMMAND`, optional). The commands, agents and skills are yours; the
bot only checks out the MR, runs the command, and collects its report for the
local studio. It never posts to GitLab by itself.

Runs on your machine under your own `claude` login and GitLab token, via a
git worktree, so it never touches the branch you're working on. It **polls**
the GitLab API, so no webhook, Maintainer rights or HTTPS tunnel is needed.

## Quickstart

```bash
npm run setup                 # npm install + build the studio + interactive setup
                              # (asks GitLab URL/project/token, repo path, your commands;
                              # checks each answer live and writes .env)
npm run doctor                # read-only checks (also run at the end of setup), each failure says how to fix it
npm run doctor -- --dry-run 123   # runs the real chain on MR !123 into a temp file
npm start
```

No commands yet? Copy `examples/commands/*.md` and `examples/agents/*.md` into
your repo's (or `~/.claude`'s) `commands/` and `agents/`, then set
`REVIEW_COMMAND=/review` and `TRIAGE_COMMAND=/triage`.

## Output contract (what your commands must know: nothing)

The bot appends instructions to every run (`--append-system-prompt`, see
`lib/report.mjs`): never post/push, write the final report to
`./.marginalia-report.md` in the working directory, or else print it in a
`<<<REVIEW_FILE path="...">>> ... <<<END_REVIEW_FILE>>>` block. `MR_REVIEW_BOT=1`
is also set, for commands written against the original contract. The report is
collected in this order:

1. `.marginalia-report.md` in the worktree;
2. the `<<<REVIEW_FILE>>>` block in stdout;
3. the raw final message, if longer than ~200 characters (logged as a warning:
   your command ignored the contract);
4. otherwise the run fails with the start of its output.

A tool refused in headless mode fails the run with a message pointing at
`CLAUDE_EXTRA_ALLOWED_TOOLS` in `.env`.

**Studio format (optional).** The studio works with any markdown, and gives the
same experience whatever command wrote it. The bot turns every report into one
normalized shape (`lib/findings.mjs`), stored next to it as `<slug>.findings.json`:
a verdict, a summary, and findings (`id`, `severity`, `title`, `path`, `line`,
`body`, `comment`). The studio lists, counts and posts from that shape, never from
the report's wording. It is read, in order of preference, from:

1. `.marginalia-findings.json`, which the contract asks the command to write
   (recommended; any extra field is ignored, and unknown severities such as
   `blocker`/`major`/`nit` are mapped):

   ```json
   { "verdict": "REQUEST_CHANGES", "summary": "One or two sentences.",
     "findings": [{ "id": "optional", "severity": "critical", "title": "Short title",
                    "path": "src/app/page.tsx", "line": 42, "body": "What and why.",
                    "comment": "The comment to post, ready as is." }] }
   ```

2. the markdown itself: a `**Verdict:** …` line (French labels work too),
   `## Critical` / `## Important` / `## Suggestions` sections with one bullet per
   finding, an optional `**Overview:**` line, and a blockquote under a bullet as its
   comment. The first `path[:line]` of the bullet is where *Add to review* anchors
   it in the diff (see `examples/commands/review.md`);
3. nothing: the studio says so in a notice, and the findings it could not read are
   left out of the per-finding "Add to review".

A finding's `id` comes from its file and title, not from the wording of its
comment, so it stays the same when a re-run rewords it. The bot warns (in its log
and in the studio) when a report could only be read partially.

To check that a new way of writing reviews works, add a folder to
`test/fixtures/skills/` (`report.md`, optionally `findings.json` or `stdout.txt`,
and an `expect.json`): `npm test` runs the whole contract against it.

## Requirements

- Node.js 18+ (`nvm use` picks the tested one from `.nvmrc`)
- The `claude` CLI installed, on `PATH` (or set `CLAUDE_BIN`), and **logged
  into your claude.ai account** (`claude login`) rather than only configured
  with `ANTHROPIC_API_KEY` — the review command needs the account's GitLab and
  Atlassian connectors to fetch the ticket and MR description. The bot
  explicitly strips `ANTHROPIC_API_KEY` from the environment before spawning
  `claude`, so even if it's set elsewhere on your machine it won't force
  API-key billing mode for these runs.
- A GitLab token with the `api` scope, only used to list open MRs (the review
  itself goes through the connectors, not this token).
- A local checkout of the reviewed repo (`REPO_LOCAL_PATH`) with an `origin`
  remote, holding your commands/agents in `.claude/` (or in `~/.claude`).

Optional extras (macOS, none of them installed or required by `npm run setup`;
the bot and the studio work without them):

- `terminal-notifier` (`brew install terminal-notifier`): makes the "Review
  ready" notification clickable; without it you get a plain, non-clickable alert.
- The VS Code CLI (`code`, on `PATH` or set `VSCODE_BIN`): fallback to open a
  review when the studio isn't running, and the "Open in IDE" button of a
  comment anchored on a line (any other IDE through `IDE_COMMAND`).
- The [SwiftBar](#menu-bar-icon-optional-macos) menu bar icon, a separate,
  entirely optional add-on.

## Installation

```bash
cd ~/marginalia
npm install
cp .env.example .env
# edit .env: GITLAB_PROJECT_ID, GITLAB_TOKEN, GITLAB_USERNAME, REPO_LOCAL_PATH
```

## Running

```bash
npm start
```

On startup and then every `POLL_INTERVAL_MINUTES` minutes (5 by default; can be
changed at runtime from the studio's top bar, see below), the
script lists the project's open MRs and only reruns a review if the head SHA
has changed since the last pass (new commit, or MR never seen before).

## Behaviour

- Optional filter on the target branch via `ALLOWED_TARGET_BRANCHES` (e.g. `develop`).
- Always ignores draft MRs, and those whose author is listed in
  `EXCLUDE_AUTHORS` (GitLab usernames, not emails, comma-separated).
- Ignores MRs with no activity (`updated_at`) for more than `STALE_AFTER_DAYS`
  days (14 by default): beyond that, they've likely diverged from `develop`
  or been abandoned.
- On first run, creates a git worktree of `REPO_LOCAL_PATH` at
  `BOT_WORKTREE_DIR` (detached, then a `.claude` symlink back to your real
  checkout so the command/agent/settings/connectors are available in it).
  Before each review/triage, checks out the MR's branch there — skipping the
  MR instead of forcing it if that branch happens to be checked out somewhere
  else (e.g. your own working copy). If you keep a worktree open per MR, set
  `BOT_CHECKOUT=detached`: the bot then checks out the MR's head without any
  local branch, so it never skips and never moves one of your branches
  (triage fixes still land on `marginalia/<branch-slug>`).
- With `MR_WORKTREES_DIR` set, there is no shared bot worktree: each MR is
  worked on in its own folder. Your own worktree for the MR's branch is used
  as it is; otherwise the bot keeps `review-<iid>` there, synced to the MR's
  head before each run and removed once the MR is merged or closed.

### Stacked MRs

An MR whose target branch is the source branch of another open MR is a layer of
a stack (rebuilt from the open MR list on every poll). For these:

- `ALLOWED_TARGET_BRANCHES` is checked against the branch the whole stack is
  based on, so upper layers are not filtered out.
- Layers are reviewed bottom to top, and each run gets the stack in its prompt:
  the layer list, the existing reviews of the other layers, and the layers above
  fetched locally (`refs/marginalia/stack/<iid>`) so it can check whether a later
  layer settles an issue before reporting it. The review ends with an
  `### Across layers` section (`- [settled-later|belongs-lower|assumes-upper !<iid>] <text>`).
- A layer is re-reviewed when the layer below it gets new commits
  (`state.json` keeps that commit under `stackBelow`).
- The studio shows the stack above the review as a merge board.
- Layers you authored yourself are not shown on the board (they go through triage).

### MRs authored by someone else (`GITLAB_USERNAME` doesn't match)

- Runs `claude -p "/code-review MR !<iid>"` in the bot worktree. The command
  handles ticket/MR lookup, diffing, the nested review worktree, and writing
  the result — this bot only triggers it and parses the review out of stdout.
- **The bot never posts anything to GitLab.** (The only way to post is the studio's opt-in button, see [Review studio](#review-studio).) Each review lands at
  `<REPO_LOCAL_PATH>/.claude/reviews/<branch-slug>.md`, for you to read and
  decide what to do with — the review command's own instructions forbid it from
  posting anything itself.
- State (last SHA reviewed per MR) is kept in `state.json`, at the project
  root (gitignored). Deleting it forces a re-review of all open MRs on the
  next poll.

### MRs you authored yourself (`mr.author.username === GITLAB_USERNAME`)

- Instead of the review command, polls the MR's GitLab discussions for comments
  left by someone other than you. Runs `claude -p "/mr-comments MR !<iid>"`
  in the bot worktree only when a new (or newer) peer comment appears since
  the last triage — a fresh push with no new comment does **not** retrigger
  it.
- the triage command triages every unresolved comment against the ticket AC and
  the diff: applies fixes for the ones it judges relevant directly in the bot
  worktree, and drafts (but never posts) a reply for the rest. In bot mode it
  writes its report to a plain file (`.marginalia-report.md`) in the bot
  worktree rather than printing it — a subagent's output only reaches the
  orchestrating command as a tool result, never as text `claude -p
  --output-format text` captures, so relying on the orchestrator re-emitting
  it verbatim as its own final message proved unreliable in practice (see
  `lib/claude-runner.mjs`'s comment on `MR_COMMENTS_REPORT_FILE`). This bot
  reads that file directly and writes the real report to
  `<REPO_LOCAL_PATH>/.claude/reviews/mr-comments-<branch-slug>.md`.
- **Fixes are committed locally in the bot worktree, never pushed.** Since
  the worktree gets `git clean -fdx` + `git reset --hard` before the next
  checkout, that commit is preserved separately under a local-only branch
  `marginalia/<branch-slug>` (the bot worktree shares its git object
  database with `REPO_LOCAL_PATH`, so this branch is visible from your real
  checkout too, e.g. `git log marginalia/<branch-slug>` or
  `git cherry-pick` from there — nothing is pushed by the bot). The studio's
  *Fixes to push* card checks them against the MR branch on origin: *ready*
  (on top of the current head), *pushed*, or *outdated* (the branch moved
  since the triage: re-run it). With `ALLOW_PUSH=true` it pushes them,
  fast-forward only, after a confirmation. A triage that commits nothing
  moves the previous fixes aside to `refs/marginalia/superseded/<branch-slug>`,
  and a triage during which the branch moved logs a warning.
- **Everything the triage writes is in English** (report, drafted replies,
  findings, commit messages): the bot's injected contract says so, whatever
  language the command or the comments are in.
- State (last peer-comment timestamp triaged per MR) is kept in `state.json`
  under `mineComments`, separately from the SHA-based state above.

Both flows share the same detailed step-by-step logs (worktree checkout,
duration, path of the written file), each line prefixed with `[MR !<iid>]` to
track several MRs across polls in the logs.

## Review studio

**Marginalia** is the local reader for the generated reviews, at `http://localhost:4477`
(`STUDIO_PORT`, bound to `127.0.0.1`, read-only). Vite + React + Tailwind
front end (`studio/`), served as static files by `studio/server.mjs`, which
`poll.mjs` starts at boot. Home lists the reviews as rows grouped by whose turn it is, read from GitLab and not from what this
browser has opened: *Needs your first review* (you have not reviewed it on GitLab), *Returned to you*
(the author pushed or answered after your review), *Review to send* (your comments wait in a pending
review), *Comments on your merge requests*, *Waiting on others* and, folded, *Done*. The poll reads
that standing for each MR (your notes, your approval or request for changes, pushes, open threads,
your drafts) and the studio refreshes the one MR right after you post, submit or delete a draft. A row
shows the author, what you decided, the Critical / Important counts, the risk, the verdict and the age (most urgent Jira ticket first when all three `JIRA_*` are
set in `.env`; `JIRA_BASE_URL` alone only links the ticket, newest first otherwise). A review opens as a
guided tour with its diff, has a copy button on the "Comment to post" blocks, and
a `⌘K` search. It refreshes live when a review file or `status.json` changes.

```bash
npm run studio:install   # once
npm run studio:build     # after any change under studio/src
npm run studio:dev       # Vite dev server with hot reload (bot must be running)
npm run dev              # bot + Vite dev server in one terminal; Ctrl+C stops both
```

`npm run dev` starts its own bot: stop the background one first
(`npm run autostart -- --uninstall`, or `pm2 stop marginalia`), or both will poll and the second can't bind the studio port.

The poll interval can be changed from the studio's top bar ("Poll every…").
It's saved to `settings.json` (gitignored) and overrides `POLL_INTERVAL_MINUTES`,
which stays the default. No restart: the bot re-arms its pending timer right
away. This is the studio's only write endpoint (`PUT /api/settings`); it
refuses requests whose `Host` or `Origin` isn't the studio itself.

**Posting (opt-in).** With `ALLOW_POSTING=true` in `.env`, each "Comment to post"
block gets an *Add to review* button. It opens a confirmation showing the final
(possibly edited) text and the target MR, then creates a GitLab **draft note**
(inline on the file/line when it can, else general) through the API with your
`GITLAB_TOKEN`. Drafts are private to you: nothing is visible to the MR author
until the *Submit review (N)* button, which asks for an optional summary and
publishes everything as one real GitLab review (`draft_notes/bulk_publish`; drafts
started in GitLab's own UI are published too). The MR is resolved server-side from
`status.json`, never from the request. Comments are remembered in `posted.json`
(gitignored) so the same one can't be added twice, and shown with an "In pending
review" then "Posted" badge. Off by default: without the flag the buttons don't
exist and `POST /api/post` and `POST /api/submit-review` answer 403.

**Design system (Scholia).** The studio's UI is documented in Storybook:
`npm run studio:storybook` (port 6006). It holds the foundations from `DESIGN.md`
(colours, type, radii, spacing) and a story per presentational component. Light and dark
follow the OS, as in the app. `npm --prefix studio run build-storybook` builds a static copy
(`studio/storybook-static`, gitignored).

**API contract.** `studio/public/openapi.yaml` (OpenAPI 3.1) describes every endpoint between
the server and the app. With the studio running, read it at
<http://localhost:4477/api-docs.html> (rendered read-only: "Try it out" is off, since the write
endpoints post to GitLab as you). Keep it in step with `studio/server.mjs` and
`studio/src/lib/api.ts` when an endpoint changes.

The "Review ready" notification and the SwiftBar menu open the studio (the
notification falls back to VS Code if the studio isn't listening).

**Deep review (on demand).** With `DEEPEN_COMMAND` set (e.g. `/deepen`, see
`examples/commands/deepen.md`), each tracked review gets a *Deep review* button.
It queues that command on the MR, in the bot worktree, after any running
review; the button shows when it is queued, then running. The command is
pointed at the automatic report and replaces it with a deeper one (checks
against the source, type check, tests); the date of the last deep review shows
above the details. It gets the shell (`Bash`) on top of the review tools.
Nothing is posted.

**Run QA (on demand).** With `QA_COMMAND` set (see `examples/commands/qa.md`),
each tracked review also gets a *Run QA* button, queued like *Deep review*. The
command tests the MR's running app in a browser (the `mcp__chrome-devtools`
tools are allowed on top of the deep review ones) and delivers a `## QA`
section, which replaces the previous one at the end of the review file; the
date of the last QA shows above the details.

**Live progress and cost of each run.** Runs use `claude -p --output-format
stream-json`. While a run is going, the studio shows its last steps above the
review's details ("Opening …", "Reading …", the commands it runs). When it ends,
its cost, output tokens and turns are logged and appended to `runs.jsonl`
(gitignored), so you can see what each pass really costs.

## Keeping the script running

On macOS, let it start at every login (a per-user LaunchAgent, no sudo, no
extra tool). It runs `npm start`, so the studio is the built one on
http://localhost:4477:

```bash
npm run autostart                  # install and start now; re-run after changing Node version
npm run autostart -- --status      # running? pid?
npm run autostart -- --uninstall   # stop and remove
tail -f ~/Library/Logs/marginalia.log
```

The agent keeps the `PATH` of the shell you installed it from, so `claude`, `git`
and `terminal-notifier` resolve the same way as in your terminal. It is restarted
if it crashes. Stop it before `npm run dev`, or both will poll.

If [SwiftBar](#menu-bar-icon-optional-macos) is installed, `npm run autostart` also
opens it at login (a second agent, `com.marginalia.swiftbar`), so the menu bar icon
comes up with the bot. Install SwiftBar first, or re-run `npm run autostart` after.

Elsewhere, use a process manager, for example `pm2`:

```bash
npm install -g pm2
pm2 start poll.mjs --name marginalia
pm2 save
pm2 startup   # to restart on machine boot
```

## Menu bar icon (optional, macOS)

Not part of the setup: `npm run setup` and `npm run doctor` neither install nor
check it, and the bot runs the same without it. Install it only if you want a
status icon in your menu bar.

The bot writes its live status to `status.json` (gitignored), which a
[SwiftBar](https://github.com/swiftbar/SwiftBar) plugin turns into a menu bar
icon, refreshed every 10 seconds:

```bash
brew install --cask swiftbar
# on first launch SwiftBar asks for a plugin folder, e.g. ~/SwiftBarPlugins
ln -s ~/marginalia/swiftbar/marginalia.10s.sh ~/SwiftBarPlugins/
npm run autostart   # optional: opens SwiftBar (and the bot) at every login
```

| Icon | Meaning |
| --- | --- |
| ✓ seal | Idle, waiting for the next poll (orange + a count if some reviews failed) |
| circular arrows | Polling GitLab |
| eye + `!<iid>` | Reviewing that MR |
| red triangle | The last poll failed (GitLab unreachable, expired token, ...) |
| grey octagon | The bot isn't running |

The dropdown is deliberately small: the bot's state (idle / polling /
reviewing), the last poll and the last review, *Poll now* and *Open reviews*
(the [studio](#review-studio), which is where the MRs and reviews are listed).
*Poll now* just sends `SIGUSR1` to the bot, which you can also do by hand:
`kill -USR1 <pid>` (the pid is in `status.json`). It's ignored if a poll is
already running.

The bot also sends macOS notifications when a review is ready, when one fails,
and when polling starts failing. Set `NOTIFICATIONS=false` in `.env` to turn
them off.

Polls never overlap: the next one is scheduled one poll interval after
the previous one *finishes*, so a long review just pushes it back.

## Troubleshooting

- **`did not produce a report`**: run `npm run doctor -- --dry-run <iid>` and read the command's raw output in the error.
- **Tool refused**: add it to `CLAUDE_EXTRA_ALLOWED_TOOLS`.
- **MR skipped, branch checked out elsewhere**: switch branch in your own checkout; retried next poll.
- **Studio says "not built"**: `npm run studio:build`.
- **Command not found in headless mode**: commands from plugins are not seen by `doctor`; `--dry-run` is the real test.

## Known limitations

- Only works while the machine is on.
- Detection delay = up to one poll interval (no instant reaction like
  with a webhook).
- `GITLAB_TOKEN` lives in `.env`, never committed (already covered by
  `.gitignore`).
- Runs are contained, not isolated in a VM. Each `claude -p` gets `--settings` built in
  `lib/claude-sandbox.mjs`: the sandbox confines Bash (writes to the bot worktree, the
  repo's `.git` and the reviews dir only; network to the GitLab host only; no read of
  `~/.ssh`, `~/.aws`, the bot's `.env`), and deny rules keep the Read/Edit/Write tools
  away from secrets, shell rc files and the trusted `.claude/{commands,agents,skills,hooks}`
  of your checkout (the sandbox does not cover those tools). Git is allowed one
  subcommand at a time (`lib/allowed-tools.mjs`), never `git config`, `git -c` or
  `git push`, and credential-looking env vars are not passed (`CLAUDE_ENV_PASSTHROUGH`).
  A command refused by the sandbox or the allow-list fails the run with its name in the
  error. Git over SSH does not work *inside* the sandbox on macOS: the bot's own fetches
  run outside it, so reviews are unaffected, but a command that runs `git fetch` itself
  will fail. `CLAUDE_SANDBOX=false` turns the sandbox off; for stronger isolation, run
  the whole bot in a container or VM.
- The review command still runs with `Agent`, `EnterWorktree`/`ExitWorktree`, `Write`,
  and the GitLab/Atlassian connectors allowed, relying on the command and agent's own
  prompt discipline ("never post to GitLab") on top of the containment above.
- No automatic retry if `claude -p` fails: check the server logs, the MR will
  be retried on the next poll as long as the SHA hasn't changed... except if
  the SHA hasn't changed, `state.json` won't have been updated either (the
  failure happens before the state write), so the next poll will retry
  automatically.
- the triage command goes further than the review command: it edits files (`Edit`)
  and reads discussions off the self-hosted GitLab MCP server. The exact tool
  name(s) that server exposes for discussions aren't documented anywhere in
  the command files — if a triage run fails with a "tool not allowed" error,
  check the error for the tool name and add it to
  `CLAUDE_MR_COMMENTS_ALLOWED_TOOLS` in `lib/allowed-tools.mjs`.
- Fixes the triage command applies are committed locally in the bot worktree and
  never pushed by the bot — review them, then push them from the studio
  (`ALLOW_PUSH=true`) or yourself from the `marginalia/<branch-slug>` local
  branch (see Behaviour above). Nothing lands on the real MR branch without
  that click.
