---
name: marginalia-review
description: Review a merge request like a senior engineer on this codebase. Assesses risk, verifies correctness by running the code, reads the repo's own conventions as the standard, and writes a guided tour of the change plus verified findings. Use when asked to review an MR/PR.
---

# Review a merge request

The codebase is the memory. Judge the change against what this repo already does, not against generic taste. Trust your own verification: report what you confirmed, drop what you could not.

## 1. Learn the repo's standard first

Before reading the diff, read what the repo says about itself: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING`, `docs/`, ADRs, lint and test config. Then read two or three files next to the changed ones to see the pattern in use.

A finding that cites the repo's own rule or an existing example ("`gitlab-notes.mjs` keeps pure logic apart from requests; this mixes them") is worth ten that cite taste. If the repo has no rule on a point, it is at most a suggestion.

## 2. Assess risk

Pick one level and say why in one sentence.

- **low**: contained, well covered by tests, no sensitive area (docs, copy, a leaf refactor with tests, a small isolated fix).
- **medium**: changes behaviour in shared code, or has meaningful logic with thin tests.
- **high**: touches auth, payments, data or migrations, a public contract, concurrency, or has a wide blast radius with weak tests.

Risk sets your effort: low gets a focused pass; high gets every caller of what changed read and every claim run. List the factors (blast radius, test coverage, sensitive area) as short strings.

## 3. Verify correctness, do not guess

- Run the tests, type check and linter that the repo defines, on the changed code. A failure is a finding with the output as evidence.
- For each behavioural change, read the callers and the callees, not only the diff. Ask what input breaks it: empty, negative, concurrent, repeated, untrusted.
- Where a claim is cheap to test, write a throwaway check and run it. Never commit it.
- Missing tests for new behaviour are a finding when the repo tests that kind of thing.

If you could not verify a suspicion, say so in the finding and mark it a `suggestion` at most.

## 4. Findings: few, real, postable

Severity:

- **critical**: wrong behaviour, data loss, security hole, broken build. Blocks the merge.
- **important**: likely bug, missing test on risky logic, breaks a repo rule. Should be fixed.
- **suggestion**: improvement the author may skip.
- **info**: a question, or something done well.

Each finding carries the file and line, why it is wrong (with the evidence you gathered), and a `comment`: one short paragraph, written to the author, specific, ready to post as is, with a concrete fix when you have one. A finding about something that is not a file (the MR description, a missing ticket, the branch) has no `path` and no `line`: never anchor it to an unrelated file just to give it a location. No restating the diff, no praise padding, no style nits the linter already enforces.

## 5. Write the overview and the tour

The reader will not open every file. Give them the whole change in two layers, written for someone who has not seen the code and does not know its identifiers.

**The overview** is a before and an after, each one or two plain sentences: what the system did before this MR, and what it does now, in terms of behaviour a user or a teammate would recognise. It is a show-me, not a file list. Bad: "Refactors the IRI queries into factories." Good: "Before, one generic call fetched every kind of link. Now each kind (place, railway company, airline) has its own, so a missing carrier is caught where it happens."

**The tour** is a list of chapters. One chapter, one idea: group the files that change for that single reason and explain the idea in plain words, as you would to a colleague at a whiteboard. Each chapter has:

- a `title` that names the idea ("Each link kind gets its own fetch"), not a path or a technical label;
- a `summary` of two or three plain sentences: what changed and why, then what to check. Avoid jargon the MR does not need; if you must name a function, say what it does the first time;
- its `files`, and the ids of the findings that belong to it.

**Check your own words before you write the JSON.** Reread both overview sentences, every chapter title and the first sentence of every chapter summary. If one names a function, file, variable or path, rewrite it as what that code does for a person: not "Replaces `TrainsHelper.getJourneyTime` with `TimeHelper.getJourneyTime`" but "Switches the journey-time calculation to the shared one, which does not exist on this branch yet". Names of code may appear later in the summary, in the check, and in the findings. The studio flags chapters that still read like code.

**Order by what matters.** The core change first: the idea the MR exists for. Then what supports it. Last, the supporting material: database changes and migrations, tests, generated files and lockfiles. The studio enforces that last group, but write them in that order yourself, and say in a tests chapter what is and is not covered. Aim for 3 to 8 chapters; a tiny MR gets 1 or 2. Give a finding an `id` whenever a chapter must reference it.

The tour covers the whole change, not only the files with findings: every changed file belongs to exactly one chapter (a glob such as `src/components/flights/**` is fine for a group of callers or tests). A chapter with no finding is normal and useful: say what to skim and why it is safe. Keep docs with the code they describe, or in their own last chapter. Do not leave callers or tests out because they are uninteresting.

## 6. Deliver

Follow the run contract you were given for where to write the markdown report and `.marginalia-findings.json`. The JSON is the source of truth for the studio:

```json
{
  "verdict": "REQUEST_CHANGES",
  "summary": "One or two sentences.",
  "risk": { "level": "high", "rationale": "Changes how totals are computed, tests cover the happy path only.", "factors": ["payments", "no negative-total test"] },
  "overview": { "before": "A coupon code typed at checkout was ignored, so every order paid full price.", "after": "Checkout takes a percentage off the items when the code is valid, and refuses an invalid code with a clear error." },
  "tour": [
    { "title": "A coupon takes its percentage off", "summary": "The helper now applies the discount to each item and rounds to the cent. Check that the total can never go below zero.", "files": ["src/lib/pricing.ts"], "findings": ["neg-total"] },
    { "title": "Tests for the coupon rules", "summary": "Covers the percentage and the no-coupon case, not a coupon larger than the order.", "files": ["src/lib/pricing.test.ts"] }
  ],
  "findings": [
    { "id": "neg-total", "severity": "important", "title": "Total can go negative", "path": "src/lib/pricing.ts", "line": 42, "body": "Why, with evidence.", "comment": "Ready to post." }
  ]
}
```

`APPROVE` when nothing critical or important remains; otherwise `REQUEST_CHANGES`. Never post to the MR yourself.
