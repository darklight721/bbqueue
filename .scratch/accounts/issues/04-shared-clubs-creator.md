# 04: Shared clubs (creator only)

**What to build:** While signed in, creating a Club makes a Shared club on the server. The creator is added to its roster automatically, linked to their Account, as Organizer, starting at Intermediate. Shared clubs appear in the Clubs list and New session, and stay in sync and in the device cache.

Editing a Club's name or a row's name or Skill level works offline and syncs later; each Club player row is saved separately, so the most recent change to a row wins. Clubs created while signed out are Local clubs, labelled "This device only", and keep today's behaviour unchanged, including after sign-up.

Spec: `.scratch/accounts/spec.md` (stories 17–18, 30–31, Implementation Decisions: Records, Domain changes, Store).

**Blocked by:** 02 (Firebase setup + Welcome + create Account)

**Status:** ready-for-agent

- [ ] A Club knows whether it's Local or Shared. Existing stored Clubs load as Local.
- [ ] A Club player can be linked to an Account with a Role. Domain types and the normalising of stored data are updated.
- [ ] Creating a Club while signed in creates a Shared club with the creator's linked Organizer row. Creating it while signed out creates a Local club.
- [ ] Shared clubs reach the UI through the existing store, and edits go out through `Backend`
- [ ] Offline edits to name and Skill level are queued and synced; the most recent change to each row wins
- [ ] Adding a new Club player row to a Shared club needs a connection; offline, it's turned off with the reason shown
- [ ] Local clubs show "This device only" in the Clubs list and on the Club screen
- [ ] Security Rules: only Accounts linked to the Club can read it; only Organizers can write it
- [ ] Contract tests cover creating, editing and subscribing to Shared clubs

## E2E workflows

- Signed in: create a Club → the roster already has me as Organizer → after a reload the Club is still there.
- Signed out: create a Club → labelled "This device only" → after signing up it's still Local.
- Offline edit of a Club player's Skill level on a Shared club → back online → the change is synced (seen from a fresh context with the same seeded Club).
