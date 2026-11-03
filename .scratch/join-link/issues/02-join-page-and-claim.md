# 02 Join page and Claim

Status: done
Spec: ../spec.md
Blocked by: 01
ADR: docs/adr/0010-join-link-claims-checked-by-rules.md

## What

Backend (load the `firestore-rules` skill first):

- `getJoinLinkInfo(token)`: the Club's id and name, or null when the record doesn't exist.
- `findJoinLinkName(token, name)`: hashes the name as in 01 and `get`s the names entry, returning `{ playerId, linked }` or null.
- `claimClubPlayer(token, playerId)`: one batch by an Account not on the Club:
  1. create `joinLinks/{token}/claims/{uid}` `{ clubId, playerId, createdAt }`;
  2. add a link `{ accountId, uid, role: "player" }` to `clubs/{clubId}/players/{playerId}`, which had none (name and skill unchanged);
  3. add the uid to `memberUids` only;
  4. set the names entry's `linked` to true.
  Fails with a distinct error when the row is already linked (the race in the spec).
- Rules: the claim record's path token must be the Club's current `joinToken`. The row update and the Club update are allowed for a non-member only when `existsAfter(joinLinks/{club.joinToken}/claims/{uid})` names this Club and row, the link's Account ID is reserved by the uid (`linkIsReserved`), the role is `player`, the row had no link, and the uid wasn't a member before. Rules tests for each refusal: stale token, already linked row, role organizer, someone else's uid, touching `organizerUids`, changing name or skill, a member claiming a second row.

App:

- Route `/join/:token` in `src/app/App.tsx`, outside the Welcome gate. A new `src/features/join/` holds the Join page: card, name steps, Confirm sheet, messages and dead ends as in the spec. Matching uses `namesEqual`, done through the hash.
- No Account: the name is validated like the Welcome name form. `createAccount(name)` runs only after Yes on Confirm, then `claimClubPlayer`. If the claim fails after the Account was made, the Account stays and the page shows the error with a retry.
- After a claim: `navigate(clubPath(clubId), { replace: true })`.
- Unit tests for the page's step logic (match, no match, already linked, race, already a member).

## E2E workflows

Spec workflows 2–8 in `e2e/join-link.spec.ts` (both single-device projects), and 11–13 in a new `e2e/emulator/join-link.spec.ts` (both emulator projects). Full `pnpm e2e` and `pnpm test:firebase` pass.

## Out of scope (later)

Have a Join link? and the iOS copy line (03). Adding yourself as a new Club player.
