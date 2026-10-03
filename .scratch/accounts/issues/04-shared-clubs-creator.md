# 04: Shared clubs (creator only)

**What to build:** While signed in, creating a Club makes a Shared club on the server. The creator is added to its roster automatically, linked to their Account, as Organizer, starting at Intermediate. Shared clubs appear in the Clubs list and New session, and stay in sync and in the device cache.

Editing a Club's name or a row's name or Skill level works offline and syncs later; each Club player row is saved separately, so the most recent change to a row wins. Clubs created while signed out are Local clubs, labelled "This device only", and keep today's behaviour unchanged, including after sign-up.

Spec: `.scratch/accounts/spec.md` (stories 17–18, 30–31, Implementation Decisions: Records, Domain changes, Store).

**Blocked by:** 02 (Firebase setup + Welcome + create Account)

**Status:** done

- [x] A Club knows whether it's Local or Shared. Existing stored Clubs load as Local.
- [x] A Club player can be linked to an Account with a Role. Domain types and the normalising of stored data are updated.
- [x] Creating a Club while signed in creates a Shared club with the creator's linked Organizer row. Creating it while signed out creates a Local club.
- [x] Shared clubs reach the UI through the existing store, and edits go out through `Backend`
- [x] Offline edits to name and Skill level are queued and synced; the most recent change to each row wins
- [x] Adding a new Club player row to a Shared club needs a connection; offline, it's turned off with the reason shown
- [x] Local clubs show "This device only" in the Clubs list and on the Club screen
- [x] Security Rules: only Accounts linked to the Club can read it; only Organizers can write it (`firestore.rules`, `firebase.json`; untested, see Comments)
- [x] Contract tests cover creating, editing and subscribing to Shared clubs (in-memory and local fake; the Firebase version joins with the emulator)

## E2E workflows

- Signed in: create a Club → the roster already has me as Organizer → after a reload the Club is still there.
- Signed out: create a Club → labelled "This device only" → after signing up it's still Local.
- Offline edit of a Club player's Skill level on a Shared club → back online → the change is synced (seen from a fresh context with the same seeded Club).

## Comments

Deferred: Firebase emulator, Security Rules tests and Firebase-backed contract/e2e tests — no Java on dev machine; e2e uses the local fake Backend (VITE_BACKEND=fake). The Firebase `Backend` shared-clubs code (`src/backend/firebaseClubs.ts`) and `firestore.rules` are type-checked / written but have never run.

Notes for later tickets:
- Firestore keeps `memberAccountIds` / `organizerAccountIds` on `clubs/{clubId}` as an index derived from the rows' links, so an Account can list its Clubs and the rules can tell who may read or write. Ticket 05 must update them in the same batch as any link or Role change (and the rules should check it with `getAfter`).
- Nothing yet stops the last Organizer's row being removed or demoted on the server; the Club screen only hides Remove on linked rows. Ticket 05 enforces the "at least one Organizer" rule.
- A Guest saved to a Shared club from New session / a running Session needs a connection (adding a row); offline, the Session player is still added but the Club row isn't.
- The e2e "after signing up" step writes the Account straight into storage because Account sign-up from the app after skipping comes with ticket 03.
