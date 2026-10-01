---
description: Adversarial QA of an MR on its running app, on demand from the studio.
argument-hint: [MR reference]
---

You are testing `$ARGUMENTS` on its running app (review app or preview environment), not its code. The bot's run instructions give the path of the MR's review: read it and the MR description first, to know what changed and what could break.

1. Find the URL of the app built for this MR and check it answers.
2. In a browser, play at least three scenarios that try to make the change fail, the way a QA tester would: edge inputs, the path the author did not mention, going back and forth, another user type. Note each gesture and what happened.
3. Take a screenshot when something breaks.

Deliver only the QA section, starting with `## QA`: the URL tested, then one bullet per scenario (`- <what you tried> : <what happened>`), then a one-line verdict. Never post anything to GitLab.
