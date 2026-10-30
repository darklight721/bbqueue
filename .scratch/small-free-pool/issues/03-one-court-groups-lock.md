# Bug: 12, 16 or 20 players on 1 Court lock into fixed groups

Status: resolved (implemented 2026-10-30)
Type: task

Vocabulary per `GLOSSARY.md`. Rule order per ADR-0009.

## Problem

On 1 Court, when the number of players is a multiple of 4, the same groups of four play in a fixed cycle. In the sweep only 16–27% of pairs ever shared a Match, and the same four returned on 90% of Matches.

## Cause (traced, `../sweep.test.ts.txt` Section 2)

The Rests in a row rule (ADR-0009 rule 2: Rests in a row ≥ 2 × Courts goes first) is to blame. The four who sat out together reach the limit together and have identical counts, and they are exactly enough to fill the Lineup. So the pick is forced (95–97% of picks), and Fairness and Mixing never get a say.

| Players on 1 Court | Pairs | With the rule switched off |
|---|---|---|
| 8, 9, 10 | 100% | 100% |
| 11 | 96% | 100% |
| 12 | 27% | 100% |
| 13 | 86% | 100% |
| 16 | 20% | 100% |
| 20 | 16% | 100% |

## Needs a decision

Changing this changes the priority order in ADR-0009, so it needs grilling and probably an ADR before implementation. Options to consider:

- Let Mixing choose among players who reach the limit together.
- Only force players in when fewer of them are at the limit than there are places.
- Bring the most-overdue player in first, and let Mixing fill the other places.

The ADR-0009 guarantee to keep is that nobody sits out more than 2 rounds in a row on 1 Court (`simulation.test.ts`, "nobody sits out more than 2 rounds in a row on 1 Court").

## E2E workflows

None — pure domain logic, covered by unit tests and the simulation.

## Comments

### 2026-10-30 — grilled, decided

Why it locks: with 4k players on 1 Court, a limit of k − 1 rounds sitting out can only be met by fixed groups (in any k rounds in a row there are 4k places for 4k players, so each plays exactly once per k rounds). Today's limit is 2 × Courts whatever the number of players, so it is exactly that tight at 12 players on 1 Court and below the average from 13 up, where "longest first" becomes first-in-first-out and keeps whoever sat out together together. The same happens at 24 players on 2 Courts (13% of pairs).

Sweep (`../sweep-03.test.ts.txt`, output `../sweep-03.output.txt`; 20 runs per cell) compared the current rule (CUR) with:
- **B**: limit = max(2 × Courts, floor(players / 4)).
- **C**: force only the single most overdue player.
- **D**: force only when fewer players are at the limit than there are places.

All three unlock 12/16/20 on 1 Court and 24 on 2 Courts (97–100% of pairs). Only B keeps every sit-out within its own limit and leaves 5–11 players on 1 Court unchanged; C and D break today's 2-round guarantee at 8–11 players and let sit-outs reach 8–10. Spread and Streak stay ≤ 2 for every variant.

## Decisions

1. **Rule (ADR-0009 rule 2):** the Rests in a row limit becomes `max(2 × Courts, floor(players / 4))`, where players = Session players not removed and not Sitting out. Everything else about the rule is unchanged (picked first, longest first).
2. **Every number of Courts**, with the one formula.
3. **11 players on 1 Court** (93–98% of pairs, same as today) is out of scope.
4. **ADR:** amend ADR-0009 in place with a dated "Amended" note: rule 2's new limit, the new guarantee in Consequences, and C and D with the sweep numbers in Considered options.
5. **Recomputed at every pick** from the players not Sitting out at that moment (like 2 × Courts already follows Courts). No smoothing.
6. **No glossary, UI or copy changes.**

## Acceptance

- `makeEnv` (`src/domain/engine/select.ts`) uses the new limit; its doc comment and the select.ts header comment say so.
- `simulation.test.ts`:
  - new scenarios: 12, 16 and 20 players on 1 Court, 24 players on 2 Courts (staggered);
  - pairs shared ≥ 95% for each new scenario;
  - on 1 Court, nobody sits out more than max(2, floor(players / 4)) rounds in a row, for 5–20 players (replaces "≤ 2 for 8–10");
  - spread ≤ 2 and Streak ≤ 2 at every pick, also for the new scenarios;
  - existing assertions (8/9/10 mixing baselines etc.) still pass.
- Unit tests that assume the limit is `2 × Courts` are updated to the formula, with at least one test where floor(players / 4) wins and one where Sitting out lowers it.
- ADR-0009 amended as in decision 4.

