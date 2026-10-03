# 09: Ended sessions of Shared clubs

**What to build:** When the Session host ends a Shared club's Session that has at least one Ended match, the Ended session (in today's slimmed shape) is saved on the server for that Club, and the Active session is cleared. Everyone linked to the Club sees it in Past sessions, the Club's sessions list, its Ended session details and its Session summary (including sharing it as an image). The server keeps the 50 most recent per Shared club, and nobody can delete them. Sessions with no Club and Local clubs keep today's on-device history.

See ADR-0005 and `.scratch/accounts/spec.md` (stories 53–56).

**Blocked by:** 06 (Shared Active session: host + live view)

**Status:** ready-for-agent

- [ ] Ending a Shared club's Session publishes the slimmed Ended session and clears the Active session
- [ ] Past sessions and the Club's sessions list combine on-device Ended sessions with those of Shared clubs, newest first, with the existing Club filter
- [ ] Ended session details and Session summary work for Shared club Ended sessions, including when viewed offline from the cache
- [ ] Only the 50 most recent per Shared club are kept
- [ ] Security Rules: anyone linked to the Club can read; only the Session host can create; nobody can update or delete
- [ ] Contract tests for publishing and listing

## E2E workflows

- Host ends a Session with Matches → in a second context, the Player sees it in Past sessions and in the Club's sessions list → opens details → View summary.
- The ended Session is gone from both devices' Home.
