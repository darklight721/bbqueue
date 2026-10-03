# 07: Take over as Session host

**What to build:** An Organizer who isn't the Session host sees "Take over" on a Shared club's Active session. A confirm dialog warns that changes the current host made but never uploaded will be lost. Taking over makes them the host straight away (in a transaction), and they can run the Session. The former host's device notices it's no longer the host, drops changes it never uploaded, and turns read-only with a short explanation.

See ADR-0007 and `.scratch/accounts/spec.md` (stories 51–52).

**Blocked by:** 06 (Shared Active session: host + live view)

**Status:** ready-for-agent

- [ ] "Take over" is shown only to non-host Organizers, needs a connection, and has a confirm dialog with the warning
- [ ] Taking over records the new host in a transaction
- [ ] The former host's device turns read-only when it sees the change, including on reconnect after being offline, and doesn't overwrite the new host's copy
- [ ] Security Rules: only an Organizer of the Club can take over
- [ ] Contract test for taking over and for a stale host's upload being refused

## E2E workflows

- Two Organizer contexts: A hosts → B takes over (confirm) → A turns read-only with an explanation → B starts a Match → A sees it live.
- A goes offline, makes a change, B takes over, A reconnects → A's change is dropped and A is read-only.
