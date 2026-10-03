# 08: Player requests: sit out / leave

**What to build:** On a Shared club's Active session, a Player (or non-host Organizer) who is a Session player can:
- switch their own Sitting out on or off
- leave the Session

Each action is sent as a request. Until the Session host's device applies it, it shows "Waiting for host". The host applies requests in the order they were made, using the existing engine operations, and skips ones that no longer make sense (for example, already Sitting out, or already left). Once a player has left, only an Organizer can add them back. Accounts that aren't Session players can only view.

See ADR-0007 and `.scratch/accounts/spec.md` (stories 45–49, Implementation Decisions: Player requests).

**Blocked by:** 06 (Shared Active session: host + live view)

**Status:** ready-for-agent

- [ ] Domain function: applying a list of requests to a Session in order through engine operations, giving back the new Session and whether each request was applied or skipped. Unit-tested, including skips.
- [ ] Request controls only for the Account's own Session player, with "Waiting for host" until it's applied
- [ ] The host's device picks up new requests, applies them, marks the result, and uploads the Session
- [ ] Requests made while the host is offline are applied after it reconnects
- [ ] Security Rules: an Account can only create requests for its own Session player in that Club's Active session
- [ ] Contract tests for creating, subscribing to and resolving requests

## E2E workflows

- Player context: switch own Sitting out on → "Waiting for host" → applied → the host's Lineups no longer pick them → switch it off again.
- Player leaves the Session → removed for the host → the Player sees they've left and has no rejoin control.
- Host offline → the Player's request shows "Waiting for host" → the host reconnects → applied.
