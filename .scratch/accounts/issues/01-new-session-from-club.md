# 01: New session from a Club screen

**What to build:** On a Club screen, a "New session" link opens New session with that Club already chosen and locked (the Club picker can't be changed). If that Club already has the Active session, the link reads "Open active session" and opens it instead. Works with today's local-only Clubs; no backend needed. Spec: `.scratch/accounts/spec.md` (user stories 37–38).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] New session accepts a Club in the URL; when present, that Club is chosen and the picker is locked
- [x] An unknown Club in the URL falls back to the normal New session screen
- [x] The Club screen (existing Club, not a new one) shows "New session", or "Open active session" when the Active session belongs to this Club
- [x] Back from New session returns to the Club screen it was opened from
- [x] Starting the Session still asks to confirm replacing a different Active session, as today
- [x] Component tests for the locked picker and the link label

## E2E workflows

- Club screen → "New session" → the Club is locked → pick players → start → lands on the Session.
- Club with the Active session → link reads "Open active session" → opens that Session.
- Back from the locked New session returns to the Club screen.
