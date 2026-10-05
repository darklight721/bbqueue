# Keep the last 50 Ended sessions on device, slimmed

When a Session ends with at least one Ended match, we now keep it as an Ended session in localStorage, next to the Clubs and the Active session (ADR-0001). The summary and details screens are calculated from it, so we no longer save a separate summary. localStorage holds only about 5 MB per site in every major browser. A full Session takes roughly 40–100 KB, mostly because of UUIDs and each Match's list of players who were free when it started. So we store a slimmed copy: name, start/end, Point system, Session players (name and Skill), and Ended matches (court, Teams, Target, start/end, Score). Data used only during play is left out: free-at-start lists, Lineups, Queues, Courts, Streak resets and Sitting out. That makes an Ended session about 25–45 KB.

We keep only the 50 most recently ended, and older ones are dropped without asking. If a save still fails because storage is full, we drop the oldest Ended session and try again. We chose this over keeping every Ended session forever, or adding a manual delete, because unlimited history would eventually fill storage and break saving of the Active session.

## Consequences

- An Ended session can't be resumed or replayed through the queueing engine, because the data needed for Streaks and fairness isn't kept.
- Summaries saved before this change are discarded on upgrade, because they have no matches or session id.
- Shared clubs (ticket 09): the same slimmed Ended session is published to the Club, `clubs/{clubId}/endedSessions/{sessionId}`, in the batch that ends the Session. Only the Session host creates it and nobody can change or delete it. Security Rules can't count, so "the 50 most recent per Club" is what the app lists (newest 50 by `endedAt`, and 50 per Club cached on each device); older ones stay on the server unlisted. Everyone on the Club sees them next to the device's own Ended sessions, each Session once. The device still keeps its own copy of a Session it hosted.
