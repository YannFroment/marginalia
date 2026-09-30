---
description: Triage reviewer comments on my own MR.
argument-hint: [MR reference]
---

Fetch the unresolved discussion threads of the MR in `$ARGUMENTS`, then for each comment decide RELEVANT, NOT RELEVANT or WRONG against the diff. Fix the RELEVANT ones in the working tree and commit locally (never push). For the others, draft a short reply (do not post it).

Final report: one section per comment with the comment, the verdict, the rationale, and either "fix applied" (file) or the drafted reply. Deliver it as the bot's run instructions say (report file, or `<<<REVIEW_FILE>>>` block).
