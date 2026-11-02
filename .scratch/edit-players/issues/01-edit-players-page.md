# 01 Edit players on its own page

Status: done
Spec: ../spec.md

## What

- New route `/clubs/:clubId/players`, "Edit players" with the Club name and player count as subtitle: the roster form from today's Players Edit mode (`PlayersEditing.tsx`), without the Club card and session cards. Footer keeps Add player and Save.
- The Club page loses Edit mode: the Players heading's Edit is a link to the new route. Make shared, the Danger zone, the card's Edit and rows opening Stats are no longer hidden or guarded.
- Back and Save return to the Club page without leaving Edit players in history (back through history when it was opened on top of the Club page, else replace); focus on the Players Edit. Back with unsaved changes asks "Discard changes?". Save with no changes skips the server. A successful Save announces "Players saved".
- Create club opens the new Club page and pushes Edit players with an empty row focused. The Club page's `?new=1` (`newClubPath`) and `leaveVia` go away; `?new=1` moves to Edit players. A reload of Edit players doesn't add another blank row.
- Redirects: unknown Club → `/clubs`; someone who may not change the roster (or stops being able to while open) → the Club page.

## E2E workflows

All of the spec's E2E workflows (1–11): new `e2e/club-players.spec.ts`, updates to `e2e/club-page.spec.ts`, `e2e/clubs.spec.ts`, `createClubFromSheet` in `e2e/club-helpers.ts` ending on Edit players, and every spec that edits a roster updated, including the emulator specs.
