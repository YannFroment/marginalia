# Ticket template

The default template of suggested tickets (SUGGEST_TEMPLATE_FILE). Write the
body in markdown with these sections, in this order. Context, User Story and
Acceptance Criteria are required; the others appear only when they have content.
`:::warning`, `:::note` and `:::success` blocks become coloured panels in Jira;
a table cannot sit inside a panel, so it goes right after it.

Title: `[Scope] Module: what changes for the user`, starting with a verb, for
example `[FE] Checkout: show an error when a step fails to save`.

## Context

:::warning
**One bold sentence that states what is wrong today.**

What a user meets now, where in the code it comes from (file and line), who it
affects. Two to five sentences.
:::

## User Story

:::note
**As a** <who benefits>,
**I need** <one capability>,
**So that** <why it is worth doing>.
:::

## Requirements

:::note
**Rules**

- One rule per line: a condition and its result.

**Out of scope**

- What this ticket deliberately does not change.
:::

## Acceptance Criteria

| # | Given | When | Then |
|---|---|---|---|
| **AC1** | <initial state> | <action> | <observable result> |
| **AC2** | <edge case or failure> | <action> | <how it is handled> |

:::success
**Done** when <the condition that closes the ticket>.
:::

## Open Questions

:::warning
- Anything undecided that blocks the work, as a question about the system.
:::

## Writing rules

- Every statement about the code rests on code you read: name the file and line.
- One row of the table is one criterion that someone can run and answer yes or no.
- At least one criterion covers an edge case or a failure.
- Under 450 words. No em dashes, no praise words, no closing summary.
