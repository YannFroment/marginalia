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
- <blocking issue, or "None">
**Comment to post:**
> **Line:** `<file path>:<line in the new version>`
> <short factual comment, ready to paste in GitLab>

### Important
- <issue, or "None">

### Suggestions
- <optional>
```

The `**Line:**` first line anchors the comment on that line of the MR diff; pick a line the diff shows (added or context), or drop it for a general comment.

Deliver it as the bot's run instructions say (report file, or `<<<REVIEW_FILE>>>` block). Outside the bot, write it to `.claude/reviews/<branch-slug>.md`. Never post anything to GitLab.
