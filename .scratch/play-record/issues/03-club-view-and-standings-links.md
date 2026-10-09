# 03 Club view screen and Standings links

Status: done
Blocked by: 02
Spec: ../spec.md (Club view, Entry points)

## What

- Route `/clubs/:clubId/players/:clubPlayerId/stats` (wouter, `src/app/App.tsx`). New screen under `src/features/play-record/`.
- Sections in order: header, headline numbers, Win rate line chart (hand-written SVG, last 20 Sessions, gaps for Sessions without a win or loss, dashed overall line, tappable dots), Partners, Session list (newest first, linking to `/sessions/:id`), the "from now on" note, and the empty state.
- Ended session Standings (`PlaceRow` in `src/features/session-summary/SummaryParts.tsx`, used by `EndedSessionScreen`): rows with a `clubPlayerId` link to the Club view. Others stay plain text. The share image and the summary are unchanged.
- Back: returns to where the page was opened from; if opened directly, goes to `/clubs/:clubId/sessions`.
- Visual design, the chart and the layout belong to @designer.

## E2E workflows

`e2e/play-record.spec.ts`, on chromium-mobile and webkit-mobile:
1. Ended session → tap a Standings name → the Club view shows that Club's figures → Back returns to the Ended session.
2. A Guest who wasn't saved to the Club is not a link.
4. Reloading the Club view keeps its content. Back then goes to the Club's Past sessions.
5. Tapping a Session row opens that Ended session.

`e2e/emulator/play-record.spec.ts`:
6. A Player (the Role) on another device opens the Club view from a Shared club's Ended session.
