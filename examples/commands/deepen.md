---
description: Deepen the automatic review of an MR, on demand from the studio.
argument-hint: [MR reference]
---

You are deepening the review of `$ARGUMENTS`. The bot's run instructions give the path of the automatic review: start from it instead of redoing everything.

1. Check every finding of the automatic review, and every claim of the MR description, against the source (the full files, not only the diff). Drop what does not hold, say what you checked.
2. Run the project's checks on this branch: install dependencies if needed, then the type check and the tests related to the changed files. Report failures with their output.
3. Read the MR discussions, so you do not repeat what a reviewer already said.

Deliver the complete updated review in the same shape as `review.md` (verdict, overview, Critical / Important / Suggestions, `**Comment to post:**` blocks), plus a short `### Checks run` section listing each command and its result. Never post anything to GitLab.
