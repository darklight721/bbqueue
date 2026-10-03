# 06: Shared Active session: host + live view

**What to build:** An Organizer starts a Session for a Shared club and becomes its Session host. They run it exactly as today, including fully offline. After each saved change the host's device uploads its latest copy of the Session once it's online.

Everyone else linked to the Club sees the Session live and read-only: Courts, Lineups, Queues, Matches and Standings, plus how old their copy is when they're offline. Home lists every Active session the person can see: one per Shared club, plus this device's own Session for a Local club or no Club. Session players copy in their linked Account at Start. The Club screen's "New session" / "Open active session" link from 01 respects Shared clubs and is shown to Organizers only.

See ADR-0007 and `.scratch/accounts/spec.md` (stories 39–44, 50, Implementation Decisions: Session host, Active sessions).

**Blocked by:** 01 (New session from a Club screen), 05 (Linking Account IDs + Roles)

**Status:** ready-for-agent

- [ ] A Session player keeps the linked Account it had at Start (snapshot, ADR-0002)
- [ ] The store holds one Active session per Shared club alongside the device's own single Session for a Local club or no Club
- [ ] Starting a Session for a Shared club records this Account and device as Session host, and stops a second Active session for that Club
- [ ] The host's device uploads the whole Session after each change; offline play keeps working and catches up on reconnect
- [ ] The Session screen has a read-only mode for anyone who isn't the host: every action that changes the Session is hidden or turned off
- [ ] Viewers show how old their copy is when it isn't live
- [ ] Home lists every Active session the person can see
- [ ] Security Rules: only the Session host writes the Active session; anyone linked to the Club can read it
- [ ] Contract tests cover publishing, subscribing and the host field

## E2E workflows

- Host (Organizer) starts a Session for a Shared club. In a second context, the Player sees it on Home, opens it, and sees a Match start live, without any controls that change the Session.
- Host goes offline, starts and ends a Match, comes back online → the viewer catches up.
- The device's own Session for a Local club and a Shared club's Active session are both listed on Home.
