# 05: Linking Account IDs + Roles

**What to build:** When an Organizer adds or edits a Club player in a Shared club, they can enter an optional Account ID (any capitalisation; the Account's name shows as "✓ Name" once found) and choose a Role: Organizer or Player.
- Unknown IDs, and an Account already linked in this Club, are rejected.
- Linking and changing Roles need a connection.
- The linked Account sees the Club straight away in its Clubs list, with no acceptance step.

Players see a read-only Club screen with a "You" label on their row and no Account IDs. Anyone can leave a Club (their row stays, no longer linked), except the last Organizer, who also can't demote or remove themselves. Organizers can unlink an Account that no longer exists.

Spec: `.scratch/accounts/spec.md` (stories 19–29, Implementation Decisions: Permissions).

**Blocked by:** 04 (Shared clubs)

**Status:** done

- [x] Domain permission functions (edit the Club, change Roles, …) and the "at least one Organizer" rule, unit-tested
- [x] Account ID field with a live lookup, any capitalisation, and errors for unknown IDs and duplicate links; turned off when offline
- [x] Role picker on linked rows; changing a Role or removing a row checks the "at least one Organizer" rule
- [x] Read-only Club screen for Players, with a "You" label and Account IDs hidden
- [x] Leave club for Players and Organizers, blocked for the last Organizer
- [x] Unlinking an Account that no longer exists
- [x] Security Rules: only Organizers link, change Roles or edit the roster; the last Organizer can't be removed or demoted; a linked Account can unlink only itself (leave). Tested on the emulator.
- [x] Contract tests cover linking, changing Roles and leaving

## E2E workflows

- Organizer adds a Club player with a valid Account ID → "✓ Name" → saves as Player. An unknown ID shows an error.
- In a second context, the linked Account sees the Club → read-only Club screen with "You" → Leave club → the Club is gone from their list.
- The last Organizer tries to demote themselves → blocked with the reason.

## Comments

Carried over from ticket 04 (Shared clubs):
- Firestore keeps `memberAccountIds` / `organizerAccountIds` on the Club record as an index derived from the rows' links. Every link or Role change must update them in the same batch as the row.
- Nothing yet stops the last Organizer's row being removed or demoted on the server; the UI only hides Remove on linked rows. The rules and the domain check belong here.
- Saving a Guest to a Shared club from New session or a running Session needs a connection; offline, the Club row is silently not added (only logged). Decide whether to surface it.
- Club screen saves to a Shared club are fire-and-forget: server rejections are only logged. Permission errors from this ticket's rules need to reach the user.

Resolved:
- Index lists: every link, Role change, unlink, leave and linked-row removal updates `memberAccountIds` / `organizerAccountIds` in the same batch as the row (`changeLinks` in `src/backend/firebaseClubs.ts`); the rules check the lists as they will be after the batch (`getAfter`).
- Last Organizer: the domain rule (`clubChangeProblem` in `src/domain/permissions.ts`) stops it in the simulated Backends and the Firebase client, and the Security Rules stop it on the server (tested on the emulator).
- Server rejections now reach the user: `saveClub` / `createClub` / `deleteClub` / `leaveClub` reject with a `BackendError` and the Club screen shows a short message. Guests saved to a Shared club from a running Session show "<Name> joined, but wasn't saved to <Club>: that needs a connection." and New session warns up front when offline.
- Deliberate choices: leaving needs a connection (like linking and Role changes); Account lookups are open to anyone signed in, one Account at a time (never listed), so an Organizer can see a name from an Account ID; Players can't start Sessions of a Shared club (it's not offered in New session).

Security Rules hardening (from the rules review; the data shape changed, there is no production data to migrate):
- **Identity is the uid.** A Club is `{ name, memberUids, organizerUids, createdAt }` and a row's link is `{ accountId, uid, role }`. The rules check membership and Role with `request.auth.uid in …Uids`, so they no longer read `accounts/{uid}` to find the caller's Account ID. The Account ID stays on the link for display and lookup. The Club list query is `memberUids array-contains uid`.
- **A link must be real.** The rules only accept a link when `accountIds/{accountId.lower()}.uid` is the link's uid, which also closes "linking an unreserved ID". A Club-creation batch may only link the creator.
- **Invariants unchanged and checked in the same batch (`getAfter`):** at least one Organizer; leaving unlinks only yourself; the lists agree with the rows; relinking a row off an Account takes it off the lists.
- **Account IDs are permanent.** `accountIds` can't be updated or deleted. A uid reserves one Account ID (`accounts/{uid}` must not exist yet, and the new Account's `accountId` must be the reserved one). Accounts accept only `name` changes, `createdAt == request.time` on create, and names of at most 40 characters (`MAX_NAME_LENGTH`, also the app's validation) for Accounts, Clubs and rows.
- **Known gaps, pinned by tests so tightening is deliberate:** the rules can't see other rows, so they don't stop two rows being linked to one Account (the app does, `already-linked`), and an Organizer can write any uid to the lists without a row (read access only, and it takes knowing the uid).
- **Client:** the Clubs rows listener retries for as long as the Club is listed (backoff up to 30 s, and at once when the Club's write is confirmed) and keeps the rows it last had; only a Club the server confirms and refuses is dropped (that is how a device learns an Organizer removed it). The members listener retries too. `settle` stops waiting after 8 s and treats the write as queued. `removeClubPlayer` falls back to the cache offline. `leaveClub` takes you off the lists when no row links you. `lookupAccount` returns null unless the Account's own ID matches what was typed.
