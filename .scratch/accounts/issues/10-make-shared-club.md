# 10: Make shared club

**What to build:** A signed-in, online person viewing a Local club can choose "Make shared club".
- A "Which player are you?" sheet lets them pick an existing roster row or "Add me" (Account name, Intermediate). That row becomes the linked Organizer. Skipping isn't allowed.
- A confirm dialog says others will see the Club and its Sessions, and that it can't be undone.
- The Club (keeping its id), its roster, its Ended sessions and its Active session (if any, with this device as Session host) move to the server, and the Club becomes Shared on this device.

When signed out or offline, the action explains what it needs.

Spec: `.scratch/accounts/spec.md` (stories 32–36, Implementation Decisions: Make shared club).

**Blocked by:** 05 (Linking Account IDs + Roles), 06 (Shared Active session: host + live view), 09 (Ended sessions of Shared clubs)

**Status:** done

- [x] Domain function: Local club + chosen row (or "add me") → Shared club with a linked Organizer. Unit-tested.
- [x] "Make shared club" on Local clubs, with the "Which player are you?" sheet and a confirm dialog
- [x] Uploads the Club, roster, Ended sessions and Active session (this device as host); on success the Club is Shared on this device, with no duplicates
- [x] Signed out or offline: the reason is shown instead of an error
- [x] Afterwards, Account IDs can be linked as in 05
- [x] A failed or interrupted conversion leaves the Local club untouched

## E2E workflows

- Signed out: create a Local club → sign up → Club screen → "Make shared club" → pick my row → confirm → the "This device only" label is gone → link a second Account → the second context sees the Club.
- Local club with an Active session → make shared → a second context sees that Session live.

## Resolution notes

- Domain: `makeSharedClub(club, choice, account, newId)` (`src/domain/makeShared.ts`) keeps the Club's id, name and rows, links the chosen row (or a new "Add me" row) as Organizer and nobody else; `sessionForSharing` copies the Account onto that row's Session player.
- Server: the Club and the first 400 rows go in one batch, further rows and the Ended sessions in batches of 400 (a batch holds at most 500 writes), then the Active session in a transaction (this Account becomes the host). A try that stops can be repeated: rows and Ended sessions already there are skipped. A failed conversion that isn't just a lost connection also deletes the half-made Club.
- Rules: an Ended session may also be created by a Club's creator importing history: the Club's only member and Organizer, within an hour of the Club's creation (the same batch or later ones). Everything else about Ended sessions is as in 09.
- The device switches over only after the server confirmed: the Shared club is stored first (hidden behind the Local club of the same id, so it never shows twice), then the Local club is removed and the device Session slot emptied.
- Signed out the Club screen says "Create an Account to share this club with other people." instead of showing the button.
