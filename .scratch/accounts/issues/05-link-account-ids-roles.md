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
