# 07: Take over as Session host

**What to build:** An Organizer who isn't the Session host sees "Take over" on a Shared club's Active session. A confirm dialog warns that changes the current host made but never uploaded will be lost. Taking over makes them the host straight away (in a transaction), and they can run the Session. The former host's device notices it's no longer the host, drops changes it never uploaded, and turns read-only with a short explanation.

See ADR-0007 and `.scratch/accounts/spec.md` (stories 51–52).

**Blocked by:** 06 (Shared Active session: host + live view)

**Status:** done

- [x] "Take over" is shown only to non-host Organizers, needs a connection, and has a confirm dialog with the warning
- [x] Taking over records the new host in a transaction
- [x] The former host's device turns read-only when it sees the change, including on reconnect after being offline, and doesn't overwrite the new host's copy
- [x] Security Rules: only an Organizer of the Club can take over
- [x] Contract test for taking over and for a stale host's upload being refused

## E2E workflows

- Two Organizer contexts: A hosts → B takes over (confirm) → A turns read-only with an explanation → B starts a Match → A sees it live.
- A goes offline, makes a change, B takes over, A reconnects → A's change is dropped and A is read-only.

## Comments

From the ticket 05 Security Rules review: an Organizer may change only the host fields, in a transaction. After a takeover, the old host's queued uploads are refused by the rules. Today a refused write is only logged, so this ticket must detect it and turn the old host read-only.

## Resolution notes

- Rules: a second `update` clause lets an Organizer of the Club (one extra `get` of the Club, takeovers are rare) change only `hostUid`, `hostAccountId`, `hostName` and `updatedAt`, naming themselves with their own reserved Account ID. The Session text can't change in that write. Rules can't tell a transaction from a plain write, so "in a transaction" is enforced by the client (`takeOverSession` in `src/backend/firebaseSessions.ts`); the rules keep the write to the host fields.
- The old host learns in two ways, both ending in the same state (the server's copy replaces theirs, so unsent changes are dropped, and the uploader stops): the observer reports a different host, or an upload is refused (`forbidden`), after which the device asks the server who hosts it (`getActiveSession`) and applies that at once.
- The former host sees "{name} took over. Changes you hadn't uploaded were dropped." in the watching strip (kept for this run of the app).
- Take over also replaces a host who left the Club or lost the Organizer Role.
