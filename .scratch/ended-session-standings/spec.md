# Spec: Standings on the Ended session details page

Status: done
Depends on: ended-sessions, session-summary, session-summary-share

Screens: `/sessions/:id` (`src/features/past-sessions/EndedSessionScreen.tsx`) and the share image of `/sessions/:id/summary`.

## Domain (no storage change)

- **Standings** are derived from the stored Ended session (`players` + `matches`). No new field is saved and no migration is needed.
- Standings include every Session player with at least one Ended match played. Players who never played are left out.
- Ranked by wins ↓, losses ↑, played ↓; name only fixes display order. Level on all three share a place (competition ranking 1, 1, 3).
- Only scored, non-level matches produce wins and losses. Unscored matches still count as played.
- Standings are shown even when no match was scored. They then show how many matches each player played.
- **Top winners** = Standings entries in places 1–3 **with at least one win**. The behaviour of the Session summary is unchanged.

## Ended session details page

- "Top winners" is replaced by a **Standings** section:
  - Collapsible, **open** by default. Header detail: "N players". Toggle button: "Hide standings" / "Show standings" with the chevron, the same pattern as History in the live session.
  - Rows look like the current winner rows. The subtitle adds losses: "3 matches played · 1 loss" (or "0 losses").
  - Gold, silver and bronze discs (and the ring on 1st) go **only to Top winners**. Every other row gets a neutral numbered disc (base-200) and no ring.
  - Shared places show the same place number; no "Joint" label.
- **Matches** section becomes collapsible, **closed** by default. Header detail: "N matches". Toggle: "Show matches" / "Hide matches". Oldest first, as now.
- Open/closed state is not remembered between visits.
- No empty state: Ended sessions always have at least one Ended match.

## Share image

- Remove the circled `BrandMark` from the image-only footer. Keep "Made with BBQueue" and the app URL.
- The summary page and image still show Top winners only.

## Acceptance

- Unit (`summary.test.ts`): Standings include 0-win players and players who only played unscored matches; leave out players who never played; rank 0–0 above 0–3; share places; produce Standings when no match was scored; Top winners still only places ≤3 with at least one win.
- Unit (`PastSessions.test.tsx`): the details page shows a Standings section (open) with every player who played, and a Matches section (closed) that opens with its toggle.
- The summary and share tests still pass. The footer has no logo image.
