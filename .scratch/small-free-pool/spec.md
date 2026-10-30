# Spec: Lineups when few players are free

Status: resolved (implemented 2026-10-30)
Depends on: lineup-mixing (ADR-0009)
Blocked by: issues/01-rest-while-in-another-lineup.md

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

## Facts confirmed (sweep, 30 seeds per cell; source in `sweep.test.ts.txt`)

- **What decides it is the number of players left over when every Court is Busy (P − 4·C), not players ÷ Courts.** With staggered Courts, the free group when a Court opens is that number + 4.
  - Each pick gives a Rest to (free − 4) players and a Match to 4, so a player averages 4 ÷ (free − 4) Matches per Rest.
  - **1 left over (free 5):** an average Streak of 4 is unavoidable. Measured 4–5 on every seed (9p/2C, 13p/3C, 17p/4C).
  - **2 left over (free 6):** exactly 2 Matches per Rest, so the Rest limit fixes the rotation. Streak stays at 2, but only 29–56% of pairs ever share a Match and the same four come back about 80% of the time (10p/2C, 14p/3C, 18p/4C). This can't be seen by comparing a Court's Match with the one before it.
  - **3 left over (free 7):** partly degraded, and worse with more Courts (11p/2C 100%, 15p/3C 87%, 19p/4C 72%).
  - **4+ left over:** 95%+ pairs with 2–3 Courts; 4 Courts need 5–6 left over.
- **Staggered vs together:** staggering doesn't cause it. Courts that start together drift 2–4 minutes apart in the first round and 5–7 by round 6 (Match length 12–18 min). That drift mixes the groups a little in the 2-left-over cells (pairs 56→77%, 38→70%), at the cost of an occasional Streak of 3.
- **Workarounds today: none that work.**
  - Rehash can only draw from free players. In the 1-left-over cells it fixed 0% of the repeated Lineups, and its single-player-swap fallback (`select.ts:364-379`) can break the Rest limit.
  - Rehash all needs 2 or more Idle Courts at once, which staggered play almost never has.
  - A Queue can't include players still on a Court (`queues.ts:109-130`), and picking ignores Queues.
  - The only thing that helped was holding an Idle Court until another Court finishes, then picking from both groups together. Pairs reach 100%, but Streak reaches 4–11 and up to ~27% of court time goes unused.
- **Found along the way (outside this spec's scope):**
  - **`freeAtStart` false Rests:** `freeAtStart` (`operations.ts:162`) counts players held by another Idle Court's Lineup as free, so they get a false Rest. When two Courts open together, real runs of 9–13 Matches show as Streak 2.
  - **Locked groups on 1 Court:** 12, 16 and 20 players on 1 Court lock into fixed groups of four (pairs 16–27%; 11 and 13 players are milder). The cause is the Rests in a row rule: the four who sat out together reach the limit together, and they are exactly enough to fill the Lineup, so they come back as one group. With the rule off, every player count reaches 100% of pairs.
- **The lock with 2 left over is forced by the rules (follow-up):**
  - On 91–92% of picks, Rest leaves exactly four players allowed to play, so Fairness and Mixing have nothing to choose between. When they do have a choice, Mixing picks the four who have met least, except where Team balance outranks it.
  - Loosening Fairness changes nothing.
  - Allowing a Streak of 3 restores most of the variety (10p/2C 100%, 14p/3C 83%, 18p/4C 66%, 15p/3C 98%). The cost: every run reaches Streak 3, and the gap between the most and fewest Matches played becomes 1.5–1.9 instead of 0.
  - Looking ahead can't help: each pick is forced by who is free at that moment.
- **With the ticket-01 fix and Courts that drift apart (Section 3):** Courts started together, Matches of 12–18 min, the host taking 0–2 min to press Start.
  - **2 Spare players:** the problem isn't only the same groups. Pairs are 69–82%, and 73–100% of runs reach Streak 3, with a maximum of 4–5.
  - **1 Spare player:** pairs are 68–88%, Streak reaches 6–8, and real back-to-back runs reach about 11.
  - **3 Spare players:** milder. Pairs are 81–100%, Streak averages about 3 with a maximum of 3–4, and most runs reach 3. That is worse than the bug was showing: 20–63% of runs had reached 3.
  - **4 Spare players:** Streak averages 2.0–2.6 and pairs are 87–100%.
  - **Rest that lasts seconds:** a Rest can last only seconds. Another Court starting while a player has just finished counts as a full Rest. So real runs without a break are longer than the Streak shows (about 4–7 on average with 2 Spare players).

## Decisions (grilling rounds 1–3, all recommendations approved)

### Engine and scope

1. **0–2 Spare players: accept it, and tell the organiser.** The app keeps picking as it does now and never leaves a Court empty by itself. A notice (below) explains why and suggests one Court fewer or more players. (Covers open questions 1 and 4.)
2. **No waiting for players about to finish.** It trades one problem for a worse one or for lost court time (sweep: Streak 4–11, up to 27% of court time unused).
3. **No hint pointing to Queues.** A Queue can't include players still on a Court, and Lineups ignore Queues, so it can't help.
4. **Term: Spare players** (in `GLOSSARY.md`).
5. **Rest excludes players in another Court's Lineup** (reworded in `GLOSSARY.md`). The engine doesn't do this yet; fixed in `issues/01-rest-while-in-another-lineup.md`, which lands first.
6. **Rest stays absolute with 2 Spare players.** No Streak 3 to mix the groups. The ADR-0009 order is unchanged, so no ADR.
7. **No look-ahead.** Every pick at 2 Spare players is already forced by Rest at that moment.
8. **Separate tickets, not part of this spec:**
   - `issues/02-rehash-swap-breaks-rest.md`: Rehash's single-player swap may break Rest.
   - `issues/03-one-court-groups-lock.md`: 12, 16 or 20 players on 1 Court lock into fixed groups.
   - `issues/04-rest-minimum-length.md`: a Rest can last only seconds.

### The notice

9. **When:** shown when the Session has
   - 2 or more Courts and 0–2 Spare players, or
   - 1 Court and 0–1 Spare players.

   Never at 3 or more. Not shown when there are fewer than 4 players per Court (a Court can't be filled); that case is out of scope.
10. **Counting:** Spare players = Session players not removed and not Sitting out, minus 4 × the number of Courts (Idle or Busy). Recomputed live: adding or removing a Court, adding or removing a player, or someone starting or stopping Sitting out shows or hides the notice straight away, without a toast.
11. **Where and who:** an inline note in the Courts section of the Session screen, below the section header, for as long as the count applies. Only whoever can change the Session sees it (the Session host, or the device running a Session that has no Club or is for a Local club). Read-only viewers don't. Not on the New session screen (for now).
12. **Dismissing:** a ✕ button hides it for that exact number of players and Courts. It comes back when the count changes into another case that shows the notice. The dismissal is remembered on the device across a reload, for this Session.
13. **Wording** (counts filled in from the Session at the time; @designer fits the layout, the text stays):
    - 2 or more Courts: "{P} players on {C} courts: only {S} sit out while every court is playing, so players will often play several matches in a row and keep meeting the same people. Use {C−1} courts or add players."
    - 1 Court: "{P} players on 1 court: only {S} sits out each match, so players will often play several matches in a row. Add players to give everyone more rests."
    - With 0 Spare players, "only 0 sit out" reads badly. Use "nobody sits out" instead.
    - Use "sits" for 1 Spare player and "sit" otherwise.
    - The text says what will happen; it doesn't say something is wrong. There is no "Remove court" button in the note.

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

In `e2e/session-courts.spec.ts`, on both mobile projects (workflow 5 in `e2e/emulator/shared-sessions.spec.ts`):

1. Start a Session with 10 players on 2 Courts: the notice shows with "10 players on 2 courts … only 2 sit out … Use 1 court". Add 2 players (12 on 2): the notice goes away. Add a Court (12 on 3): it shows again, with "nobody sits out" and "Use 2 courts". Remove that Court: it goes away.
2. Make a player Sitting out so the count drops to 2 Spare players: the notice shows. Stop Sitting out: it hides.
3. Dismiss the notice at 10 on 2 Courts, reload: it stays hidden. Remove a player (9 on 2): it shows again.
4. 6 players on 1 Court: no notice. 5 players on 1 Court: the 1-Court text, with no "Use … courts" suggestion.
5. Read-only viewer of a Shared club Session (emulator project, `e2e/emulator/`): doesn't see the notice while the Session host does.

Unit tests (Vitest) cover the Spare players count and the show/hide cases, including 0 Spare players and fewer than 4 per Court.
