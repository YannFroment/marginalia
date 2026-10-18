# Review: add checkout summary

**Branch:** feat/summary | **Ticket:** COL-1043 | **MR:** !3922

**Verdict:** REQUEST CHANGES

**Overview:** Adds the checkout summary card. The opening price can differ from the card price.

## Critical

- **Price mismatch on open** in `src/app/checkout/summary.tsx:42`: the modal opens at the default option price, not `upfrontPrice`.

  **Comment to post:**

  > The opening price only equals the card price if every default has a `priceDifference` of 0. I would assert that it equals `upfrontPrice`.

## Important

- **Boolean default stored as a code** in `src/app/checkout/options.ts:17`: `isChecked` only knows `'true'`.

  > Store the same representation as `onChange` for boolean defaults.

- None.

## Suggestions

- **Duplicated type** `ActivityOptionSelection` in `src/app/checkout/types.ts`.
