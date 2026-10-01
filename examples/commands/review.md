---
description: Review the current branch's diff against its ticket/MR description.
argument-hint: [MR reference or hint]
---

Review the pending changes of the current branch: `git diff origin/<target>...HEAD`. Use the `reviewer` agent for the analysis, passing it the diff and `$ARGUMENTS`.

Write the final review in this shape (the bot's studio reads it):

```
# <MR title>
**Branch:** <branch> | **MR:** !<iid>
**Verdict:** APPROVE | REQUEST CHANGES
**Overview:** <one or two sentences>

### Critical
- `<path/to/file.ext:line>` <blocking issue, or "None">
**Comment to post:**
> <short factual comment, ready to paste in GitLab>

### Important
- <issue, or "None">

### Suggestions
- <optional>
```

Start each issue bullet that has a `**Comment to post:**` with the repo-relative path and the line of the new file version it is about, in backticks (`` `src/foo.ts:42` ``): the studio posts the comment on that line of the MR diff. Use a line that the MR changed; without one the comment attaches to the whole file.

Deliver it as the bot's run instructions say (report file, or `<<<REVIEW_FILE>>>` block). Outside the bot, write it to `.claude/reviews/<branch-slug>.md`. Never post anything to GitLab.
