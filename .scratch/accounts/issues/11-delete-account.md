# 11: Delete Account

**What to build:** Account settings gets "Delete Account".
- If the Account is the only Organizer of a Shared club that has other Accounts, deletion is blocked, and those Clubs are listed.
- Otherwise a single confirm dialog lists the Shared clubs (and their Ended sessions) that will be deleted, because this Account is their only Account, and the Clubs where its link will be removed.

Confirming:
- deletes those Shared clubs
- unlinks this Account's rows elsewhere (the rows stay as plain Club players)
- deletes the Account record (its Account-ID reservation is kept forever, so the Account ID can never be reused)
- deletes the anonymous Firebase user
- clears Shared club data from the device

The device returns to signed-out, with Local clubs and Sessions with no Club untouched.

Spec: `.scratch/accounts/spec.md` (stories 12–16, Implementation Decisions: Deleting an Account).

**Blocked by:** 03 (Avatar + Account settings), 05 (Linking Account IDs + Roles), 09 (Ended sessions of Shared clubs)

**Status:** done

- [x] Domain function that plans the deletion (what blocks it, what gets deleted, what gets unlinked), unit-tested
- [x] Blocked state lists the Clubs and explains how to fix it (promote someone first)
- [x] The confirm dialog lists what will be deleted; deletion needs a connection
- [x] Carries out the plan, then the device is signed out with Local data kept and the default avatar back
- [x] Security Rules allow an Account to delete itself, Shared clubs where it's the only Account, and its own links. The Account-ID reservation is never deleted
- [x] Contract tests for the deletion steps

## E2E workflows

- Account that's the only member of a Shared club, plus a Local club → Delete Account → the dialog lists the Shared club → confirm → default avatar, the Shared club is gone, the Local club remains.
- Only Organizer of a Club with a Player → Delete Account is blocked and names the Club.
- In a second context, a Player's linked row stays on the roster but is no longer linked after an Organizer's Account is deleted (with another Organizer remaining).

## Comments

From the ticket 05 Security Rules review: Account-ID reservations are permanent. If one could be deleted, anyone could reserve the same Account ID again and inherit every Club and Role still linked to it. Delete Account removes only the Account record and the anonymous auth user.

## Resolution notes

- Plan: `planAccountDeletion` (`src/domain/accountDeletion.ts`) gives `blocked` (only Organizer of a Club with other linked Accounts), `deleteClubs` (the only linked Account, with each Club's Ended session count), `unlinkClubs` and `hostedClubs`.
- Server: `Backend.deleteAccount({ deleteClubIds, unlinkClubIds })` checks everything first (an unlink must leave an Organizer, a delete must have no other linked Account), then deletes the Clubs, unlinks the rows, deletes `accounts/{uid}`, then the anonymous sign-in (signed out if Firebase wants a recent login). The Account-ID reservation is never touched. A stop part-way can be retried.
- Deleting a Club: its Ended sessions and requests go first in batches of 400, while the Club still stands, then unlinked rows in batches, then the linked rows, the Active session and the Club in a last batch. `deleteSharedClub` (the Club screen's Delete club) uses the same code; its history is only deleted when the caller is the Club's only member, otherwise it stays unlisted (orphaned under the gone Club, unreadable).
- Rules: Ended sessions may be deleted by the Club's only member (an Organizer); never updated. Requests may also be deleted by an Organizer in the batch that deletes the Club. An Account may delete only itself; the Account-ID record is never deletable.
- Hosted Active sessions: left on the server for another Organizer to take over (take over already replaces a host who is gone); this device keeps a copy in its own Session slot when that is empty, otherwise it has none. The dialog says so.
