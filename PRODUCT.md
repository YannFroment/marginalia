# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers on one team who review each other's GitLab merge requests. Each person runs their own copy of marginalia on their own machine, under their own `claude` login and GitLab token; nothing is shared or hosted. Confirmed by the product owner: the audience is "my team", not a single person and not the public.

The job when they open the studio: an MR has been reviewed by the bot in the background, and they now need to read that review, decide what is worth saying, and say it on the MR. A second recurring job is triaging the comments other people left on their own MRs.

## Product Purpose

marginalia is a poller that watches open MRs on a GitLab project and runs the team's own Claude Code slash commands headless (`REVIEW_COMMAND` for MRs written by others, `TRIAGE_COMMAND` for reviewer comments on one's own MRs). The **studio** is its local web app: it lists the reports those commands produce and is where a person reads them.

Success, as confirmed by the product owner:

- **Read a review quickly and well**: verdict, blocking points and reasoning understood in seconds, without opening the raw markdown.
- **Post the right comment**: the proposed comment can be copied, edited, and (opt-in) posted on the MR, with the person in control.
- **Triage feedback on their own MRs**: comments received on one's own merge requests are worked through efficiently.

## Positioning

The bot brings no review logic of its own: the commands, agents and skills are the team's. It only checks out the MR, runs the command, and collects the report. It never posts to GitLab by itself; the only way anything leaves the machine is an explicit, confirmed click in the studio, and only when `ALLOW_POSTING=true`. Everything runs locally (studio bound to 127.0.0.1), by polling, so no webhook, Maintainer rights or public tunnel is needed.

## Operating Context

- GitLab merge requests polled at a configurable interval (default 5 minutes, adjustable at runtime from the studio).
- Claude Code CLI run headless in a git worktree dedicated to the bot, so the developer's own branch is never touched.
- Reports are markdown files, read from the studio at `http://localhost:4477` (port configurable). A macOS menu bar item (SwiftBar) and desktop notifications tell the person when a review is ready.
- Reviews arrive in bursts when the machine is on; a person typically returns to several at once, so the open set of reviews changes constantly and read/unread state matters.
- The keyboard layout of team members varies (QWERTY and AZERTY have both been used); shortcuts must follow the typed character, not the physical key.

## Capabilities and Constraints

- Works with any markdown report. Richer display (verdict badge, Critical / Important counts, overview, "Comment to post" blocks) when the report follows the optional format in `examples/commands/review.md`; otherwise reviews are listed as "Unrated".
- Studio features in place: card grid with three sizes, tabs for the reviews being read, a sidebar of all reviews, a command palette, copy / edit / opt-in post of the proposed comment, semantic typography (semfont) that can be toggled off, live updates, poll-interval setting.
- Interface language is English. This is a binding requirement: no French in the UI.
- Reports may be long and contain unbroken paths and identifiers; they must never break the layout.
- Browsers reserve some shortcuts (⌘W cannot be intercepted); the studio uses Ctrl+W, ⌥W and ⌘⌥W to close a review tab.
- Stack is settled: Node.js poller, React + Vite + Tailwind studio in `studio/`. Undecided: a manual light/dark switch (the theme follows the operating system today).

## Brand Commitments

- Name: **marginalia** (product and package), decided by the product owner.
- The studio speaks plainly and in English; no marketing tone.

## Evidence on Hand

- `examples/commands/` and `examples/agents/`: sample review and triage commands.
- Real generated reviews from the author's own use exist on their machine (about thirty), used to develop the studio. They are not part of this repository.
- No usage data, customer testimonials or benchmarks exist. None should be invented.

## Product Principles

1. **Reading comes first.** The studio exists to make a long review quick to understand; everything else supports that.
2. **The person stays in control of anything that leaves the machine.** No automatic posting; every send is explicit, previewed and reversible in the person's own hands (edit before posting).
3. **Bring your own commands.** Nothing in the studio may assume one repository, one review style or one report format; the optional format only enriches.
4. **Local and quiet.** Runs on the person's machine, notifies without nagging, and shows what the bot is doing at a glance.
5. **Robust to real reports.** Long identifiers, missing sections and unrated reports are normal input, not edge cases.

## Accessibility & Inclusion

Target standard: **WCAG 2.2 AA**, confirmed by the product owner. In practice: readable contrast in both light and dark themes, full keyboard operation, correct semantics for screen readers, reduced-motion support, and layouts that work on narrow screens.
