# 09: Ended sessions of Shared clubs

**What to build:** When the Session host ends a Shared club's Session that has at least one Ended match, the Ended session (in today's slimmed shape) is saved on the server for that Club, and the Active session is cleared. Everyone linked to the Club sees it in Past sessions, the Club's sessions list, its Ended session details and its Session summary (including sharing it as an image). The server keeps the 50 most recent per Shared club, and nobody can delete them. Sessions with no Club and Local clubs keep today's on-device history.

See ADR-0005 and `.scratch/accounts/spec.md` (stories 53–56).

**Blocked by:** 06 (Shared Active session: host + live view)

**Status:** done

- [x] Ending a Shared club's Session publishes the slimmed Ended session and clears the Active session
- [x] Past sessions and the Club's sessions list combine on-device Ended sessions with those of Shared clubs, newest first, with the existing Club filter
- [x] Ended session details and Session summary work for Shared club Ended sessions, including when viewed offline from the cache
- [x] Only the 50 most recent per Shared club are kept
- [x] Security Rules: anyone linked to the Club can read; only the Session host can create; nobody can update or delete
- [x] Contract tests for publishing and listing

## E2E workflows

- Host ends a Session with Matches → in a second context, the Player sees it in Past sessions and in the Club's sessions list → opens details → View summary.
- The ended Session is gone from both devices' Home.

## Resolution notes

- Record: `clubs/{clubId}/endedSessions/{sessionId}` holds `{ hostUid, endedAt, endedJson, createdAt }` (the slimmed Ended session as JSON text, since Teams are arrays in arrays). Read by anyone on the Club. Created only by the Session host, and only while the Club has an Active session (the rules read it as it was before the batch), once per Session id. Never updated or deleted.
- The end is one batch: delete the Active session, delete its requests, create the Ended session. Offline, they wait in Firestore's queue together, so the Ended session can't be lost with the Active session. If another Organizer took over meanwhile, the whole batch is refused and the host keeps its own copy on the device.
- "50 most recent": rules can't count, and nobody may delete, so nothing is pruned on the server. Every listing is the newest 50 by `endedAt` (a `limit(50)` query), and each device caches at most 50 per Club (and fewer if its storage is full). Older ones stay on the server unlisted; at about 25 to 45 KB a night that is small.
- The device's own Ended sessions and the Shared clubs' are one list (`useEndedSessions`), newest first, each Session once, so Past sessions, the Club filter, a Club's sessions list, details, summary and image share all work unchanged and, from the device's cache, offline. A Club the Account has left is hidden at once.
