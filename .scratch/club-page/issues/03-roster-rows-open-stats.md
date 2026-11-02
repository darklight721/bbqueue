# 03 Roster rows open Stats, Back returns to the Club page

Status: ready-for-agent
Blocked by: 02
Spec: ../spec.md (Stats from the roster)

## What

- Outside Players Edit mode, each roster row (with a chevron) links to `/clubs/:clubId/players/:clubPlayerId/stats`, for every Role.
- The link carries an origin marking it came from the Club page: a new query param next to `FROM_SESSION_PARAM` in `src/features/play-record/statsOrigin.ts`. `clubStatsBackPath` sends it Back to `/clubs/:clubId`. Bare Stats URLs keep today's Back.
- The chain holds: Club page → Stats → a Session row → Ended session → Back → Stats → Back → Club page. The `playerStats` Session origin (`src/features/past-sessions/sessionOrigin.ts`) must carry the Stats page's own origin so the second Back still lands on the Club page.
- In Edit mode rows don't link anywhere. Links off the page keep today's "Discard changes?" guard.

## E2E workflows

`e2e/club-page.spec.ts`, on chromium-mobile and webkit-mobile:
8. Tap a roster row → that Club player's Stats → Back returns to the Club page; reloading Stats first keeps Back on the Club page; the Club page → Stats → Ended session → Back → Back chain ends on the Club page.
10. A Player (the Role) opens a Club player's Stats from the roster.
