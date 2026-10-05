# 06: Shared Active session: host + live view

**What to build:** An Organizer starts a Session for a Shared club and becomes its Session host. They run it exactly as today, including fully offline. After each saved change the host's device uploads its latest copy of the Session once it's online.

Everyone else linked to the Club sees the Session live and read-only: Courts, Lineups, Queues, Matches and Standings, plus how old their copy is when they're offline. Home lists every Active session the person can see: one per Shared club, plus this device's own Session for a Local club or no Club. Session players copy in their linked Account at Start. The Club screen's "New session" / "Open active session" link from 01 respects Shared clubs and is shown to Organizers only.

See ADR-0007 and `.scratch/accounts/spec.md` (stories 39–44, 50, Implementation Decisions: Session host, Active sessions).

**Blocked by:** 01 (New session from a Club screen), 05 (Linking Account IDs + Roles)

**Status:** done

- [x] A Session player keeps the linked Account it had at Start (snapshot, ADR-0002)
- [x] The store holds one Active session per Shared club alongside the device's own single Session for a Local club or no Club
- [x] Starting a Session for a Shared club records this Account and device as Session host, and stops a second Active session for that Club
- [x] The host's device uploads the whole Session after each change; offline play keeps working and catches up on reconnect
- [x] The Session screen has a read-only mode for anyone who isn't the host: every action that changes the Session is hidden or turned off
- [x] Viewers show how old their copy is when it isn't live
- [x] Home lists every Active session the person can see
- [x] Security Rules: only the Session host writes the Active session; anyone linked to the Club can read it
- [x] Contract tests cover publishing, subscribing and the host field

## E2E workflows

- Host (Organizer) starts a Session for a Shared club. In a second context, the Player sees it on Home, opens it, and sees a Match start live, without any controls that change the Session.
- Host goes offline, starts and ends a Match, comes back online → the viewer catches up.
- The device's own Session for a Local club and a Shared club's Active session are both listed on Home.

## Comments

From the ticket 05 Security Rules review:
- Keep the Active session in one fixed record per Shared club (for example `clubs/{clubId}/activeSession/current`), so "at most one per Club" is built into the layout.
- Store the Session host's auth uid on it and check `resource.data.hostUid == request.auth.uid` in the rules. It costs no extra reads, and host uploads are the most frequent write.
- Decide whether a host who loses the Organizer Role mid-Session may keep uploading.

## Resolution notes

- Record: `clubs/{clubId}/activeSession/current` holds `{ sessionJson, hostUid, hostAccountId, hostName, updatedAt }`. Created by an Organizer only while none exists; updated (Session text and time only) and deleted by the host only; read by anyone on `memberUids`. A host who loses the Organizer Role, or leaves the Club, keeps uploading until somebody takes over (decided; noted in `firestore.rules`). The place for ticket 07's take-over is a second `update` clause in those rules and a `takeOver` call next to `publishActiveSession`.
- Uploads: store first, then a coalescing uploader (`src/backend/sessionUploader.ts`): debounce about 1 s (at most 5 s late), one write in flight, nothing while offline, the latest copy once on reconnect.
- The live Session screen has no Standings section today (Standings are part of the Session summary), so viewers see Courts, Lineups, Queues, Matches (History) and Players.
- Ticket 09 publishes Ended sessions to the Club where the host ends a Session (`src/backend/sessions.ts`, `endSharedSession`).
