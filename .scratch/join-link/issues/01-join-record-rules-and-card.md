# 01 Join link: Join record, Security Rules, and the Join link card

Status: ready-for-agent
Spec: ../spec.md
ADR: docs/adr/0010-join-link-claims-checked-by-rules.md

## What

Backend (load the `firestore-rules` skill first):

- Data (also in the comment at the top of `firestore.rules`):
  - `clubs/{clubId}` gains `joinToken?` (the current token). Organizers may set or change it.
  - `joinLinks/{token}` `{ clubId, clubName, createdAt }`. Signed-in users may `get` it but not `list`. An Organizer of `clubId` creates it only when the Club's `joinToken` after the batch is this token. Organizers update `clubName` and delete it.
  - `joinLinks/{token}/names/{nameHash}` `{ playerId, linked }`. `get` only, never `list`. `nameHash` is the hex SHA-256 of `token + ":" + normalizeName(name).normalize("NFC").toLowerCase()` (locale-independent lower case, salted by the token). One entry per Club player, linked ones included.
- Token: 128 bits of `crypto.getRandomValues`, base64url (22 characters).
- New Backend methods (contract-tested in a new `backend.joinLink.contract.ts`, run against the in-memory, local fake and Firebase Backends):
  - `getJoinLink(clubId)`: the token, creating the Join record on first use (Organizer only, online).
  - `resetJoinLink(clubId)`: new token and record. Deletes the old record and its names (best effort: the rules check the Club's current token, so leftovers can't be used).
- Every existing write that changes the roster or the Club name (`addClubPlayer`, `updateClubPlayer` renaming, `removeClubPlayer`, `linkClubPlayer`, `unlinkClubPlayer`, `leaveClub`, `deleteAccount`'s unlinks, `renameSharedClub`) updates the Join record in the same batch when the Club has a `joinToken`. `deleteSharedClub` deletes it. The rules must let a member who unlinks themselves (leave, delete account) set their own name entry's `linked` to false.
- Rules tests in `firestore.rules.emulator.test.ts`: non-members can't list `joinLinks` or names; only Organizers create, change or delete the record; a stale token can't create a record for a Club.

Club page:

- `src/features/club-edit/`: a `JoinLinkCard` under the Players section, Organizers of a Shared club only, hidden in Players Edit mode. Share link (`navigator.share`, falling back to the clipboard with "Link copied") and Reset link (confirm, disabled offline), as in the spec. Errors show on the card.
- Component tests: shown to an Organizer, absent for a Player and on a Local club, hidden in Edit mode, Reset disabled offline.

## E2E workflows

Spec workflow 1 in a new `e2e/join-link.spec.ts` (both single-device projects). The local fake Backend needs the Join record too (`FAKE_BACKEND_KEYS`, `e2e/fixtures.ts`).

## Out of scope (later)

The Join page and the claim (02), Have a Join link? and the iOS copy line (03).
