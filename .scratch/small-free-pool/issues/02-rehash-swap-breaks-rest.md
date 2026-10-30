# Rehash never breaks Rest or Fairness silently; a sheet offers the choices

Status: resolved (implemented 2026-10-30)
Type: task

Vocabulary per `GLOSSARY.md`.

## Problem

When the only allowed set of four is the current Lineup, `pickDifferentLineup` falls back to the best single-player swap (`src/domain/engine/select.ts:364-379`). `swapKey` ranks swaps by Rest key and "passed over" count, but nothing stops it from bringing in a player who would then play a third Match in a row.

## Evidence (sweep, `../sweep.test.ts.txt`, not instrumented)

At 1 Spare player (9 on 2 Courts, 13 on 3), pressing Rehash on each repeated Lineup raised the longest Streak from 4–5 to 11–12. The cause is inferred from the code; it hasn't been traced pick by pick.

## Decisions (grilled 2026-10-30, all approved)

1. **No silent swap.** Rehash picks a different allowed set of four (same rules as any Lineup, ADR-0009). The single-player swap fallback is removed from Rehash.
2. **Fairness counts like Rest.** A swap that leaves out someone owed a place is blocked the same way.
3. **When no different allowed set exists, a bottom sheet asks before anything changes.** Dismissing or Cancel leaves the Lineup exactly as it was. When a different allowed set exists, Rehash acts straight away with no sheet, as today.
   - With exactly four Candidates (nobody to swap in), no sheet: Rehash re-splits the Teams straight away, as today. *(Assumed; not grilled.)*
4. **Sheet content** (Session host only):
   - Title: "No one else can come in"
   - Text: Rest → "Anyone else would play a third match in a row." Fairness → "The others have played more."
   - **New Teams** (primary): the same four, best other split, even if Team balance is worse. Always shown: the sheet only opens with five or more Candidates, so another split always exists.
   - **Rehash all idle courts** (only when Rehash all is possible, i.e. 2+ Idle Courts), with a small line: "Also changes the Lineup on Court 2." / "Also changes Courts 2 and 3." (the other Idle Courts that hold a Lineup).
   - **Swap anyway**: the old swap, on purpose. One player in, picked by the usual rules but ignoring Rest and Fairness. Not remembered afterwards.
   - **Cancel**.
5. **The toast is unchanged.** No action buttons and no change to its timing.
6. **Glossary:** Rehash reworded (done). No ADR: ADR-0009 already applies the rules to Rehash.
7. **Rehash never makes unbalanced Teams** (Q4′ a). New Teams may change the difference from 0 to 1, but never above 1. If no other balanced split exists, New Teams isn't offered and the sheet adds "No other balanced Teams for these four."
8. **Swap anyway and Rehash all keep ADR-0009's preference for balanced fours** (Q12 a). The hard balance rule is only for Rehash and New Teams.
9. **Third reason, "waited"** (Q11 b): when Rests in a row, not Rest, is what blocks, the text is "The players in this Lineup have sat out too long to wait again."
10. **Fourth reason, "balance"** (Q13 a): when other fours are allowed by Rest and Fairness but none of them splits into balanced Teams, Rehash is blocked. The text is "Anyone else would make unbalanced Teams." The balance rule for Rehash and New Teams: the result's Team balance must be no worse than max(1, the current Lineup's balance). So if the current Lineup is already unbalanced because no balanced four exists, Rehash may pick another four that is no worse.
11. **Exactly four Candidates and no other split within that limit** (Q14): the Lineup stays as it is and the existing toast says "No other balanced Teams for these four."

Sweep facts behind 4 (Section 5): Rehash all shows up 0% of the time with staggered Courts and 10–33% at 1–2 Spare players when Courts drift. When it is offered, the pressed Court gets new players 96–100% of the time and total Rest and Fairness never get worse. It changes the other Idle Courts' Lineups 96–100% of the time.

## Engine contract (shared by the lanes; revised after Q11–Q14)

- `rehashBlock(session, courtId, ctx): { reason: "rest" | "fairness" | "waited" | "balance"; newTeams: boolean } | null`. Null when Rehash can act directly: a different allowed set within the balance limit exists, or there are exactly four Candidates. `newTeams` is true when another split of the current four is within the balance limit. Reason priority: rest, then waited, then fairness, then balance (whichever is the first to leave no different set).
- `rehashCourt(session, courtId, ctx): Result<"court-not-found" | "court-busy" | "no-other-balanced-teams">`. It returns a different allowed set within the balance limit, or else the best other split of the same four within the limit, or else fails with `no-other-balanced-teams` (toast: "No other balanced Teams for these four."). It never swaps.
- `swapIntoLineup(session, courtId, ctx): Result<"court-not-found" | "court-busy" | "nobody-to-swap">`: the old swap fallback (best single-player swap, ignoring Rest and Fairness, normal balance preference).
- `rehashAll`: unchanged (normal preference).
- Session actions (`src/features/session/context.ts`, `SessionProvider.tsx`): `rehashCourt`, `rehashAll`, `swapIntoLineup(courtId)`.

## E2E workflows

In `e2e/session-courts.spec.ts`, on both mobile projects:

1. With 2 Spare players, press Rehash where only the current four are allowed. The sheet opens and the Lineup is unchanged. **New Teams** gives the same four in a different split, and the sheet closes.
2. Same setup, **Swap anyway**: one player is swapped, and the incoming player is someone who was rested.
3. Same setup, **Cancel**: nothing changes.
4. Two Idle Courts: the sheet shows **Rehash all idle courts** with "Also changes the Lineup on Court 2". Tapping it changes both Lineups.
5. With enough Spare players, Rehash acts straight away with no sheet (regression).
6. Mixed Skill, Rest-blocked, and the current split is the only balanced one (e.g. Skills 3, 2, 2, 1: only [3,1] v [2,2] is balanced): the sheet has no **New Teams** and shows "No other balanced Teams for these four."

Unit tests cover the engine: no swap, Fairness blocks too, a re-split even if unbalanced, `rehashBlock` reasons, and `swapIntoLineup`. The `it.fails` test at `select.test.ts:564` becomes a normal passing test.

## Comments

Confirm-and-diagnose only; nothing in `src/` changed. Sweep source: `../sweep.test.ts.txt`, Section 4 (30 seeds, 1–4 Courts × 0–4 Spare, staggered and drift+delay, one Rehash press at every picked Lineup, not applied).

**Reproduced.** `src/domain/engine/select.test.ts` ("does not bring in a player who would play a third Match in a row (ticket 02)", marked `it.fails` so the suite stays green; remove `.fails` when fixed). Five Candidates: p1–p4 at Streak 1 (the current Lineup), p5 at Streak 2. Rest leaves one allowed set, so Rehash falls back and returns p5 plus three of p1–p4.

**Branch diagnosis.** `pickDifferentLineup` has three outcomes (`select.ts:353-386`):
- A: a different set that `fairSets` allows (`:360-362`).
- B: single-player swap (`:365-379`), used when the only allowed set is the current one.
- C: re-split of the same four (`:381-385`), reached only when there are exactly four Candidates, because the swap branch returns first whenever `swapNeighbours` is non-empty (five or more Candidates).
When Rest forces the current set, every swap brings in a rested Candidate (`outsiders`), so every neighbour has the same sorted Rest keys. `swapKey` (`:341-347`) sees a tie and the pick among them is random. There is no Rest-respecting different set to find: it isn't that `swapKey` ranks badly, there is nothing better to rank. The Rest-respecting option, a different split of the same four, is never tried because branch B returns first.

**Numbers** (share of presses per branch; "breaks Rest" = Σ restKey of the result higher than the current Lineup's):

| Spare | Branch A | Branch B (swap) | Branch C | B breaks Rest | Rest-neutral different set existed (of B) |
|---|---|---|---|---|---|
| 0 | 0% | 0% | 100% | n/a | n/a (re-split only) |
| 1 | 23–41% | 59–77% | 0% | 100% | 0% |
| 2 | 7–21% | 79–93% | 0% | 100% | 0% |
| 3 | 89–100% | 0–11% | 0% | 98–100% | 0–2% |
| 4 | 91–100% | 0–9% | 0% | 99–100% | 0–1% |

- A never broke Rest in any cell.
- At 2 Spare (10p/2C, 14p/3C, 18p/4C, 6p/1C) the current Lineup had nobody at Streak 2 in 100% of B cases and the result had someone (Streak 2 → 3) in 100% of them.
- At 1 Spare the swap-in is the rested player with the highest Streak; the current Lineup already holds Streak-2 players there, so the Streak 2 → 3 count is 0, but the Rest cost still rises every time (trace: 9p/2C, pick after pick the same player goes from Streak 5 to 8).
- A different set of four that respects Rest practically never exists when the fallback fires (0–2% of swap cases, only via sets Fairness had excluded). A different split of the same four always exists (3 splits).

**`replaceInLineup`:** not affected. 120,960 calls, never a worse Rest key than the best Candidate (`restCut(candidates, 1)`, `select.ts:404`). When it picks a Streak-2 player it is forced (no better Candidate).

**`rehashAll.ts`:** not affected. 6,560 presses, never more Rest cost than before. The "inn" players never leave and swaps only happen inside the cut field.

