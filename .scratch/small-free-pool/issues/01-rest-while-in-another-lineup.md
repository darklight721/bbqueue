# Bug: players in another Court's Lineup get a false Rest

Status: ready-for-agent
Type: task
Blocks: `../spec.md` (Streak numbers are wrong until this lands)

Vocabulary per `GLOSSARY.md`.

## Problem

`GLOSSARY.md` defines a Rest as a Match starting without a player *while that player was free and not in another Court's Lineup*. The engine counts players held by another Idle Court's Lineup as free:

- `beginMatch` sets `freeAtStart` to `freePlayerIds(session)` minus the four starting (`src/domain/engine/operations.ts:162`). `freePlayerIds` (`src/domain/engine/select.ts:55-60`) doesn't exclude players in another Lineup.
- `buildHistory` gives everyone in `freeAtStart` who didn't play a Rest and resets their Streak (`src/domain/engine/stats.ts:92-95`).

So when two Courts are Idle together and their Matches start one after the other, the second Court's four get a Rest from the first Court's start, even if they start seconds later.

## Evidence (sweep, `../sweep.test.ts.txt`)

When Courts start at the same instant, players had real back-to-back runs of 9–13 Matches while the engine showed a Streak of 2. The gap between the most and fewest Matches played grew from about 1 to 3–5. With `freeAtStart` corrected in the test driver, the Streak shown matched the real runs.

## Expected

A player in another Court's Lineup when a Match starts doesn't get a Rest from that Match and keeps their Streak.

## Open point for implementation

- Decide whether to change `freeAtStart` at the point it is recorded, or exclude Lineup players when history is read. Ended matches already stored with the old `freeAtStart` stay as they are; only new Matches use the fixed rule.
- Also check Queue moves (`moveQueueToCourt`), which release players from other Lineups.

## E2E workflows

None — pure domain logic (`src/domain/**`), covered by unit tests: two Idle Courts with Lineups, start one then the other, and the second Court's players keep their Streak.

## Comments

- **Fixed at record time** in `src/domain/engine/operations.ts`: a new `restingAtStart` (free, not in the Match, not held by another Court's Lineup via `heldPlayerIds`) now fills `freeAtStart` in `beginMatch`, so `startMatch` is covered. Stored Matches keep their old `freeAtStart`.
- **`moveQueueToCourt`**: the Match is started, the queued players are released from other Lineups, and only then is `freeAtStart` set from the Lineups as they stand after the release (Court 2's replacements count as held). Players left in the target Court's own Lineup are free and still rest. `fillLineups` runs after.
- **Backend:** nothing validates or recomputes `freeAtStart` (`parseSession.ts` only reads the list, `firestore.rules` doesn't mention it), so no backend or rules change.
- **Tests:** `operations.test.ts` (two Idle Courts: held players keep Streak and Rests in a row; a free player in no Lineup still rests; Queue move; the old `startMatch` expectation now `[]`) and `simulation.test.ts` (simultaneous starts: no real back-to-back run longer than the replayed Streak, across 9p/2C, 10p/2C, 13p/3C, 14p/3C for 5 seeds; fails on the old code).
- **Threshold change:** `rules.test.ts` "rest with staggered match ends" (Courts started in the same minute, 10–20 min Matches, worst of 30 seeds) now shows real Streaks: 13/3 went 5 → 6, 9/2 went 5 → 6, 14/3 went 3 → 4. Limits raised by 1 with a comment. 10/2 stays at 3.
