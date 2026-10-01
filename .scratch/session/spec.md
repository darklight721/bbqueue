# Spec: Session screen

Status: ready-for-agent
Depends on: foundation, new-session, queueing-engine

Route: `/session` (no saved Session → redirect `/`). Also reached via Home → Resume session.

All state changes go through the queueing engine and are **saved immediately** to storage. The screen re-renders from the saved state, so reload/resume restores it exactly (timers derive from timestamps).

## Layout (mobile-first, top to bottom)

1. **Top bar**: Back (→ `/`), Session name, Point system badge ("21 pts" / "31 pts").
2. **Courts** section
   - **Rehash all** button — enabled only when ≥ 2 Idle Courts.
   - One card per Court (sorted by number):
     - "Court N" + status (Playing / Idle).
     - **Busy**: Team A vs Team B (each player: name, Skill badge, matches played); live duration mm:ss (ticks every second); **End match** → score dialog; **Remove match** → confirm ("Remove this match? It won't count.").
     - **Idle**: Lineup Team A vs Team B, or "Waiting for players" when none; **Rehash** (disabled without a Lineup); **Start match** (disabled without a Lineup).
     - **Remove court** — disabled while Busy, with hint "End or remove the match first". No confirm when Idle.
   - **Add court** button (disabled at 10 Courts).
3. **Queues** section
   - Each Queue: Team A (2 slots) vs Team B (2 slots). Tap an empty slot → player picker sheet listing non-removed Session players alphabetically, excluding players already in this Queue, each with Skill badge, matches played and status (On court N / In lineup court N / Sitting out / Free). Filled slot has a clear (×) button.
   - Non-blocking warning badges: Unbalanced, 3rd in a row (name), Repeat partners, Sitting out (name).
   - **Move to court** buttons: one per Court ("Court N · Idle/Playing"). Disabled when the Court is Busy, the Queue isn't full, or a queued player is on court (show reason, e.g. "Ana is on court 1").
   - **Remove queue** (no confirm).
   - **Add queue** button.
4. **Players** section
   - All non-removed Session players alphabetically: name, Skill badge, matches played, status chip (On court N / In lineup court N / Sitting out / Free).
   - **Sit out / Back in** toggle per player.
   - **Remove** per player — blocked while in an Active match (message "End or remove their match first"); otherwise confirm "Remove <name> from this session?".
   - **Add player**: shared add-player form; "Save to club" checkbox (unchecked by default) only when the Session has a Club; if checked, also append to the Club.
5. **History** — collapsible (collapsed by default), newest first. Each: "Match #n · Court N", Team A names (Skill) vs Team B names (Skill), score or "No score", duration mm:ss.
6. **End session** button → confirm "End session?" (+ "N matches in progress will be ended without a score." when applicable) → engine `endSession`, save SessionSummary, delete Session, navigate `/session/summary`.

## Score dialog

- Title "End match — Court N". Two number inputs labelled with each Team's names.
- **Save** (validated: integers, no tie, winner ≥ target) and **End without score**; Cancel closes.

## Player display rule

Every time a player appears on this screen: name + Skill level badge + matches played (Ended matches only).

## Acceptance (e2e, seeded storage where useful)

- Starting from New session with 8 players / 2 Courts: both Courts show disjoint Lineups; Start match on Court 1 → Busy with timer; Lineup on Court 2 unchanged.
- End match with score → History entry #1 with score; Court 1 gets a new Lineup immediately; matches-played counts update.
- End without score → History shows "No score".
- Remove match → no History entry, counts unchanged.
- Rehash changes Court's Lineup; Rehash all disabled with 1 Idle Court, enabled with 2.
- Queue: fill 4 slots by hand, Move to an Idle Court → match starts with those Teams, Queue disappears; Move disabled for Busy Court / incomplete Queue / player on court.
- Players: sit out removes them from a Lineup (replacement fills in); remove blocked while on court; add player appears and can be picked.
- Add/remove Court; remove disabled while Busy.
- Reload page mid-match → state and timer restored. Back → Home shows Resume session.
- End session with an Active match → confirm mentions it → lands on summary.
