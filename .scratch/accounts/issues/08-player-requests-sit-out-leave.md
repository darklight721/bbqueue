# 08: Player requests: sit out / leave

**What to build:** On a Shared club's Active session, a Player (or non-host Organizer) who is a Session player can:
- switch their own Sitting out on or off
- leave the Session

Each action is sent as a request. Until the Session host's device applies it, it shows "Waiting for host". The host applies requests in the order they were made, using the existing engine operations, and skips ones that no longer make sense (for example, already Sitting out, or already left). Once a player has left, only an Organizer can add them back. Accounts that aren't Session players can only view.

See ADR-0007 and `.scratch/accounts/spec.md` (stories 45–49, Implementation Decisions: Player requests).

**Blocked by:** 06 (Shared Active session: host + live view)

**Status:** done

- [x] Domain function: applying a list of requests to a Session in order through engine operations, giving back the new Session and whether each request was applied or skipped. Unit-tested, including skips.
- [x] Request controls only for the Account's own Session player, with "Waiting for host" until it's applied
- [x] The host's device picks up new requests, applies them, marks the result, and uploads the Session
- [x] Requests made while the host is offline are applied after it reconnects
- [x] Security Rules: an Account can only create requests for its own Session player in that Club's Active session
- [x] Contract tests for creating, subscribing to and resolving requests

## E2E workflows

- Player context: switch own Sitting out on → "Waiting for host" → applied → the host's Lineups no longer pick them → switch it off again.
- Player leaves the Session → removed for the host → the Player sees they've left and has no rejoin control.
- Host offline → the Player's request shows "Waiting for host" → the host reconnects → applied.

## Comments

From the ticket 05 Security Rules review:
- Store requests at `…/requests/{id}`, with the requester's Account ID and `createdAt == request.time`.
- Only Accounts on the Club's member list may create requests; only the Session host may update them.
- Rules can't look inside the Session's player list, so the Session host must check that the requester owns that Session player, using the Account copied onto it at Start.

## Resolution notes

- Record: `clubs/{clubId}/activeSession/current/requests/{id}` holds `{ uid, accountId, sessionId, sessionPlayerId, kind, createdAt }` (kind: `sit-out`, `back-in`, `leave`), later `{ status: 'applied' | 'skipped', resolvedAt }`. Created by anyone on the Club for themselves, with their own reserved Account ID, only while the Club has an Active session. Read by the requester and by the host. Updated only by the host, once, and only the status fields. Deleted only by the host, in the batch that ends the Session. The requests belong to the record, so a new host (take over) finds the pending ones.
- Order: `createdAt` by the server's clock, then the order given. A request is marked `applied` only after a copy of the Session that includes it has reached the server (so a host replaced before then leaves it pending for the new one); skipped requests change nothing and are marked at once.
- Leaving while the player is in a Match is deferred (stays "Waiting for host") and applied after the Match; the engine can't remove a player mid-match.
- A request needs a connection to make. Marking requests needs one too; the host's device tries again when it is back online.
- After a reload on the host's device before the marks went out, requests are applied again and come out `skipped` (the effect is already in the copy). The Session is right either way.
