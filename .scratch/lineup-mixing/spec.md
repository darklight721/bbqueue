# Spec: Lineup Mixing

Status: done
Depends on: queueing-engine
Decision: ADR-0009 (supersedes ADR-0003's priority order)

Vocabulary per `GLOSSARY.md`: Mixing, Opponent, Rests in a row, Wait.

## Problem

Strict Fairness makes Lineups lock into fixed groups of four. A simulation (24 Matches, 3 seeds, same and mixed Skill levels) showed:

| Session | Pairs ever sharing a Match | Distinct 4-sets |
|---|---|---|
| 8 players, 1 Court | 12 / 28 | 2 |
| 12 players, 2 Courts started at different times | 18 / 66 | 3 |
| 16 players, 3 Courts started at different times | 24 / 120 | 4 |

The cause is the rank key `[max(0, streak−1), recent, total]`. The group that just sat out always has strictly fewer `recent` or `total` Matches, so `selectionPool` produces exactly one 4-set. Wait, `rng` and the partner rules never decide anything. Play counts stay even, so the problem is variety. 9 and 10 players on 1 Court already rotate fine.

## Definitions

- **restKey(p)** = `max(0, streak − 1)`. Unchanged.
- **rests(p)** (Rests in a row): the number of Match starts since p's last Match at which p was in `freeAtStart` and didn't play. It resets to 0 when p plays, and at `streakResetAt[p]` (Sitting out).
- **restsTier(p)** = `max(0, rests − T + 1)`, where `T = 2 × courts.length`.
- **recent(p) / total(p)**: unchanged (Matches in the Fairness window / all Matches).
- **x is owed a place before c** (`x ≻ c`), compared only within the same Rest group (and the same Rests-in-a-row group):
  - `recent(x) ≤ recent(c) − 2`, **or**
  - `recent(x) ≤ recent(c)` **and** `total(x) ≤ total(c) − 2`.

  This is a strict partial order: nobody is owed a place before themselves, and it is transitive. Sorting by `(recent, total)` never puts c ahead of anyone owed a place before c.
- **Allowed set**: whenever a chosen player is owed a place by someone else in the same group, that someone is also chosen. "Level" is never treated as a group of players, so the non-transitivity problem does not arise.
- **met(a, b)**: the number of Ended Matches in the Session where a and b both played, as Partners or Opponents.
- **mix(set)** = `Σ met(a, b)` over the set's 6 pairs.

## Algorithm: pick a Lineup (Candidates, 4 places)

1. **Rest**: group by `restKey`, lowest first. Whole groups that fit in the places are in (`inn`). The group where the cut falls is the **field**, with k places left to fill.
2. **Rests in a row**: inside that group, split by `restsTier`, highest first, in the same way. Whole tiers that fit are in, and the tier where the cut falls becomes the field.
3. **Owed-by sets**: `dom(p) = {x ∈ field : x ≻ p}`. Drop p when `|dom(p)| ≥ k`, because p can never fit.
4. **Pool cut**: if more than `MAX_POOL` (12) players remain, sort by `(recent, total)`, then longest Wait, then rng, and keep the first 12. The cut stays allowed, because anyone owed a place before a kept player sorts earlier and is also kept.
5. **Enumerate** every k-combination of the cut. Keep only the allowed ones, and add `inn` to each.
6. **Score** every (set, split), compared left to right, and take the smallest:
   `[balance > 1 ? 1 : 0, mix(set), Σrecent, Σtotal, −Σwait, partnerRepeats, balance, rng]`

## The other places that pick players

- **Rehash (`pickDifferentLineup`)**:
  - Take the best of the allowed sets other than the current one.
  - If there is none, try one-player swaps, ranked by `[sorted rest keys, number of chosen players who are owed a place by someone left out]`.
  - If that also fails, choose a different split of the same four (unchanged).
- **Replacing one player (`replaceInLineup`)**:
  - Get the field from the Rest and Rests-in-a-row steps with 1 place.
  - Level Candidates are those nobody else in the field is owed a place before.
  - Score each as `[rest..., level y]` with the same tuple, which means Mixing reduces to `Σ met(y, r)` over the three who stay.
- **Rehash all (`rehashAll.ts`)**:
  - Get `inn`, the field and the places from the same steps with `4 × courts` places.
  - The chosen field players must include everyone owed a place before them: add players in random order, but only once everyone owed a place before them is already in. Swap y in for z only if everyone owed a place before y stays in, and z isn't owed a place before anyone who stays.
  - The greedy start (`pickLineup` per Court) stays the first start.
  - Cost: `[unbalancedCourts, Σ_courts mix, Σrecent, Σtotal, −Σwait, partnerRepeats, Σbalance, unchanged]`.
  - Update the docblock that says the search "never drops anyone else".
- **Queue warnings**: unchanged. There is no Mixing warning.

## Code changes

- `stats.ts`:
  - Add `met(a, b)` to History. Each Ended Match adds 1 to its 6 pairs, keyed by `pairKey`.
  - Add `rests` to PlayerHistory.
- `select.ts`:
  - Replace `rankKey` and `selectionPool` with `restKey`, the Rests-in-a-row tier, `owes(x, c)` and `restCut(candidates, count) → { inn, field, slots }`.
  - Replace `strictSets` with `fairSets`.
  - Use the single score in `scoreSplit`/`bestSplitOf` and drop `withWait`. Update the comments on why Wait ranks where it does.
  - Build `dom` and `met` once per operation.
- `rehashAll.ts`: as above.
- `MAX_POOL` stays at 12. Raise it to 16 only if simulation shows Mixing getting weaker above about 28 players.

## Acceptance (unit tests, seeded rng)

- `met` counts Partners and Opponents once per Ended Match. Active and Removed Matches don't count.
- `rests` goes up when a player is free and doesn't play, and resets when they play or Sit out.
- `≻`: a truth table, plus a random property test that nobody is owed a place before themselves and that it is transitive.
- 8 players, 1 Court, after R1 = {1,2,3,4} and R2 = {5,6,7,8}: the R3 Lineup has exactly 2 players from each group.
- Random histories: no chosen player is owed a place by a Candidate in the same group who was left out, and Rest is still applied first.
- A player whose Rests in a row reach T is picked over a better-mixed set.
- A balanced split existing outranks Mixing.
- Latecomer: in the first Lineup after joining. At (1 recent, a low total), they are not picked over players with 0 recent when Mixing ties.
- `replaceInLineup` picks the level Candidate with the fewest meetings with the three who stay, and never picks someone that another Candidate is owed a place before.
- Rehash still returns a different Lineup when the only allowed set is the current one.
- `rehashAll`:
  - the result includes everyone owed a place before its players;
  - players Rest forces in are kept;
  - its Mixing score is no worse than the greedy start;
  - the "different" requirement still holds.
- More than 12 Candidates: the cut still includes everyone owed a place before its players.

## Acceptance (simulation, `simulation.test.ts`)

Add a driver where Courts start at different times. Before changing the rule, record today's results for 9 and 10 players. Set each threshold about 10% below the worst of 10 seeds.

| Session | Length | Pairs that must have shared a Match | Today |
|---|---|---|---|
| 8 players, 1 Court | 16 rounds | ≥ 26 of 28 | 12 |
| 12 players, 2 Courts started at different times | 36 Matches | ≥ 85% of 66 | 27% |
| 16 players, 3 Courts started at different times | 48 Matches | ≥ 75% of 120 | 20% |

- 8 players: the same 4-set comes back 2 rounds later at most once.
- 9 and 10 players: pair coverage at least as good as the recorded baseline.
- At every pick, among players present from the start, the most minus the fewest Matches played is ≤ 2, and every Streak is ≤ 2.
- Rounds sat out in a row: ≤ 2 on 1 Court. On 2 and 3 Courts, check that Rests in a row actually triggers; if it never does, lower T.
- Latecomer joining at minute 60: in the first Lineup after joining, and over the next 60 minutes plays at most 1 Match more than the most anyone else plays.

## E2E workflows

None. This is selection logic in `src/domain/**`, covered by unit and simulation tests, with no screen, route or persistence change.
