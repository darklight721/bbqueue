# Spec: Lineups when few players are free

Status: needs-triage
Depends on: lineup-mixing (ADR-0009)

Vocabulary per `GLOSSARY.md`.

## Problem

When a Session has only a few more players than the Courts hold, the next Lineup has almost nobody to choose from:

- **Who is free:** a Lineup is picked when a Court becomes Idle, from players who are free right then. That means the four who just finished plus whoever was sitting out.
- **What simulation found** (staggered Courts, after ADR-0009 landed; the numbers are the same as before it):

| Session | Free when a Court opens | Pairs ever sharing a Match | Longest Streak |
|---|---|---|---|
| 10 players, 2 Courts | ~6 | 25 / 45 | — |
| 13 players, 3 Courts | ~5 | 39 / 78 | 4 |

- **Why Rest and Mixing can't help:**
  - With 5 free players, 3 of the four who just finished must play again.
  - The other Courts' groups are never Candidates.
  - So groups lock, and Streaks go past the Rest limit.

## Facts to confirm before grilling

- Does it happen whenever players ÷ Courts is under about 4.5–5? Run a sweep over player and Court counts.
- How much does starting the Courts at different times affect it, compared with starting them together?
- Can the organiser get around it today with Rehash, Rehash all or a Queue?

## Open questions (for the grilling session)

1. **Expectations:** is a Streak of 3–4 acceptable or unavoidable when the Session is this tight, or should the app tell the organiser that there are too few players for the Courts?
2. **Wait for players about to finish:** should the app hold an Idle Court's Lineup open for players who are about to finish on another Court? That means picking from a bigger group a few minutes later, which costs court time.
3. **Look-ahead:** should the app plan a Court's next Lineup knowing who will be free soon, rather than only who is free now?
4. **Suggest fewer Courts:** should the app suggest using fewer Courts when players ÷ Courts is low?
5. **Hand-built fix:** is it enough to surface a hint that points the organiser to Queues?

## Handoff context

- **Already landed:** commit `88b7511`, Lineup Mixing. Read `docs/adr/0009-mixing-within-one-match-fairness-tolerance.md` (the current priority order and the "passed over by 2+" guarantee) and `.scratch/lineup-mixing/spec.md`.
- **Selection code:**
  - `src/domain/engine/select.ts`: `restCut`, `owes`, `fairSets`, `pickLineup`, `pickDifferentLineup`, `replaceInLineup`.
  - `src/domain/engine/rehashAll.ts`.
  - History, including `met` and `rests`, is in `src/domain/engine/stats.ts`.
- **When Lineups are picked:** `endMatch` calls `fillLineups` (`src/domain/engine/lineups.ts`), so a Court's next Lineup is picked the moment its Match ends, from players free at that instant.
- **Simulation driver:** `playStaggered` / `runAll` in `src/domain/engine/simulation.test.ts`. It supports staggered Court starts, seeds and mixed Skill. Reuse it for the sweep under "Facts to confirm".
- **Next step:**
  - Run the fact sweep through a sub-agent.
  - Then grill the open questions with the domain-modeling discipline: update `GLOSSARY.md` inline, and write an ADR only if all three ADR criteria hold.
  - Do not implement until the spec is approved.

## E2E workflows

To be decided. If the outcome is engine-only, `None — pure domain logic`. A hint or a "Waiting for players" state on the Court would need an e2e test on the Session screen.
