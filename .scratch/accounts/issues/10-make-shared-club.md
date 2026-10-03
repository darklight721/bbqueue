# 10: Make shared club

**What to build:** A signed-in, online person viewing a Local club can choose "Make shared club".
- A "Which player are you?" sheet lets them pick an existing roster row or "Add me" (Account name, Intermediate). That row becomes the linked Organizer. Skipping isn't allowed.
- A confirm dialog says others will see the Club and its Sessions, and that it can't be undone.
- The Club (keeping its id), its roster, its Ended sessions and its Active session (if any, with this device as Session host) move to the server, and the Club becomes Shared on this device.

When signed out or offline, the action explains what it needs.

Spec: `.scratch/accounts/spec.md` (stories 32–36, Implementation Decisions: Make shared club).

**Blocked by:** 05 (Linking Account IDs + Roles), 06 (Shared Active session: host + live view), 09 (Ended sessions of Shared clubs)

**Status:** ready-for-agent

- [ ] Domain function: Local club + chosen row (or "add me") → Shared club with a linked Organizer. Unit-tested.
- [ ] "Make shared club" on Local clubs, with the "Which player are you?" sheet and a confirm dialog
- [ ] Uploads the Club, roster, Ended sessions and Active session (this device as host); on success the Club is Shared on this device, with no duplicates
- [ ] Signed out or offline: the reason is shown instead of an error
- [ ] Afterwards, Account IDs can be linked as in 05
- [ ] A failed or interrupted conversion leaves the Local club untouched

## E2E workflows

- Signed out: create a Local club → sign up → Club screen → "Make shared club" → pick my row → confirm → the "This device only" label is gone → link a second Account → the second context sees the Club.
- Local club with an Active session → make shared → a second context sees that Session live.
