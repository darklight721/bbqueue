# 01 Join page: "Welcome to" on the card, and what happens next

Status: done
Spec: ../spec.md

## What

- `src/features/join/JoinScreen.tsx` (`JoinCard`): remove the pill; add `CourtCardCaption` "Welcome to" above the `h2`. The `h2` keeps naming the card.
- Same file: a small component with the spec's copy, rendered between `HomeScreenCopyLine` and `body` only when a name form is on the page: `shown` is `your-name` or `name-in-club` and the page isn't offline (`NEEDS_CONNECTION` swaps those for the offline notice).
- `src/features/join/JoinScreen.test.tsx`: replace the "Join club" check with "Welcome to" and no pill. Add: the explanation shows on both name steps; it doesn't show on no-match, already-linked, just-claimed, offline, or with Confirm straight from the Account's Name.

## E2E workflows

No new workflow. Swap "Join club" for "Welcome to" in the card checks of `e2e/join-link.spec.ts` (lines 68–71, 353) and `e2e/emulator/join-link.spec.ts` (lines 89, 207). Full `pnpm e2e` passes, emulator projects included.

## Out of scope (later)

- Totals on the card (see the spec).
