# 11: Delete Account

**What to build:** Account settings gets "Delete Account".
- If the Account is the only Organizer of a Shared club that has other Accounts, deletion is blocked, and those Clubs are listed.
- Otherwise a single confirm dialog lists the Shared clubs (and their Ended sessions) that will be deleted, because this Account is their only Account, and the Clubs where its link will be removed.

Confirming:
- deletes those Shared clubs
- unlinks this Account's rows elsewhere (the rows stay as plain Club players)
- deletes the Account and its Account-ID record
- deletes the anonymous Firebase user
- clears Shared club data from the device

The device returns to signed-out, with Local clubs and Sessions with no Club untouched.

Spec: `.scratch/accounts/spec.md` (stories 12–16, Implementation Decisions: Deleting an Account).

**Blocked by:** 03 (Avatar + Account settings), 05 (Linking Account IDs + Roles), 09 (Ended sessions of Shared clubs)

**Status:** ready-for-agent

- [ ] Domain function that plans the deletion (what blocks it, what gets deleted, what gets unlinked), unit-tested
- [ ] Blocked state lists the Clubs and explains how to fix it (promote someone first)
- [ ] The confirm dialog lists what will be deleted; deletion needs a connection
- [ ] Carries out the plan, then the device is signed out with Local data kept and the default avatar back
- [ ] Security Rules allow an Account to delete itself, its Account-ID record, Shared clubs where it's the only Account, and its own links
- [ ] Contract tests for the deletion steps

## E2E workflows

- Account that's the only member of a Shared club, plus a Local club → Delete Account → the dialog lists the Shared club → confirm → default avatar, the Shared club is gone, the Local club remains.
- Only Organizer of a Club with a Player → Delete Account is blocked and names the Club.
- In a second context, a Player's linked row stays on the roster but is no longer linked after an Organizer's Account is deleted (with another Organizer remaining).
