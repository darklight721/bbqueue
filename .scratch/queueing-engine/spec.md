# Spec: Queueing engine

Status: ready-for-agent
Depends on: foundation (data model)

A **pure TypeScript module** (`src/domain/engine/`), no React, no storage, no `Date.now()` or `Math.random()` inside. Every function takes the Session state plus `now: number` and an injected `rng: () => number` (seedable, e.g. mulberry32) and returns a **new** Session state. Fully unit-tested with Vitest before the Session screen uses it.

Vocabulary per `GLOSSARY.md`; rule priority per ADR-0003.

## Definitions

- **Free player**: in the Session, not removed, not Sitting out, not in an Active match.
- **Held player**: in some Court's Lineup. Lineups on different Courts never share a player. **Queues do not hold players.**
- **Candidate** (for a Lineup on Court C): a Free player not held by a Lineup on another Court.
- **Streak** of player P: replay started Matches (Active + Ended, by `startedAt`) after P's last reset; if P is in the Match → +1; else if P was Free when it started (recorded on the Match as `freeAtStart: playerId[]`) → reset to 0. Sitting out resets the Streak (record `streakResetAt[playerId] = now`). Removed matches are deleted, so they leave no trace in the replay.
- **Recent count**: Matches (Active or Ended) containing P with `startedAt >= now - window`; window = 15 min (21-pt) or 30 min (31-pt).
- **Total count**: Matches (Active or Ended) containing P.
- **Wait**: `now - (endedAt of P's last Ended match ?? P.joinedAt)`.
- **Skill value**: beginner 1, intermediate 2, advanced 3. **Team balance** = |sum(Team A) − sum(Team B)|.
- **Partner repeats** of a split: for each Team, number of previous started Matches (Active/Ended) where those two were Partners; summed.

## Rules (hard)

1. A Match/Lineup has exactly 4 distinct players in 2 Teams of 2.
2. A player is never in two Active matches, and never in two Lineups.

## Rules (soft, strict priority — ADR-0003)

1. **Rest**: avoid players whose Streak ≥ 2.
2. **Fairness**: fewest Recent count, then fewest Total count.
3. **Team balance** ≤ 1.
4. **New partners**: fewest Partner repeats.
Then: longest total Wait of the four; then random.

## Algorithm: pick a Lineup for one Court

1. Rank Candidates by key `(streak >= 2 ? 1 : 0, recent, total)` (ascending).
2. If fewer than 4 Candidates → Lineup = null ("Waiting for players").
3. Let K = key of the 4th-ranked Candidate. Players with key < K are **in**. Players with key == K form the **tie pool**; choose the remaining slots from it.
4. For each combination from the tie pool (bounded: if the pool is huge, cap via random sampling of ≤ 2 000 combinations using `rng`) and each of the 3 possible splits, score `(balance > 1 ? 1 : 0, partnerRepeats, balance, -sumWait, rngTiebreak)`; pick the minimum.

Team split for a given 4 (used for Queues' warnings and partial replacements): minimise `(balance > 1 ? 1 : 0, partnerRepeats, balance, rng)` over the 3 splits.

## Operations (each returns new Session)

| Operation | Behaviour |
| --- | --- |
| `createSession(input, now, rng)` | Snapshot players; Courts 1..n; fill Lineups (see Fill). |
| `fill(session)` | For each Idle Court **without** a Lineup, lowest number first: pick a Lineup. Existing Lineups are never changed by Fill. |
| `rehashCourt(courtId)` | Re-pick that Court's Lineup (its own held players become Candidates again). Result must differ from the current Lineup when any different valid Lineup exists: prefer best-scoring Lineup with a **different set of players**; if none exists (exactly 4 Candidates), choose the best **different split**. |
| `rehashAll()` | Only when ≥ 2 Idle Courts. Release all Idle Courts' Lineups; select 4k players (k = Idle Courts with enough players) using the same ranking/tie-pool rule; partition into k groups × splits minimising, in order: number of Courts with balance > 1, total partner repeats, total balance, then random. Must differ from the previous arrangement (Court → Teams) when possible. Exact optimum not required for k ≥ 3 — use a seeded randomised local search (e.g. random restarts + pairwise swaps, ≤ 500 iterations). |
| `startMatch(courtId)` | Court must be Idle with a Lineup. Create Active match (teams from Lineup, `startedAt = now`, `freeAtStart` = Free players not in it), clear Lineup. |
| `moveQueueToCourt(queueId, courtId)` | Allowed only if Court is Idle, Queue has 4 players, none in an Active match. Queued players who are Sitting out are brought back in. Discard the Court's Lineup; start the Match with the Queue's Teams as set by hand; delete the Queue. Any **other** Court's Lineup containing a queued player: **replace only that player** with the best Candidate (rank key, then the split rule), re-split; if no Candidate → that Lineup becomes null. Then Fill. |
| `endMatch(matchId, score \| null)` | Status ended, `endedAt = now`, score, `number` = count of Ended matches + 1. Court becomes Idle → Fill (this Court gets a Lineup immediately). |
| `removeMatch(matchId)` | Delete the Match entirely. Court Idle → Fill. |
| `addCourt()` | Lowest unused number (max 10 Courts). Fill. |
| `removeCourt(courtId)` | Rejected if Busy. Lineup players released. Fill. |
| `addPlayer(player)` | Add (validated unique name). Fill. |
| `removePlayer(playerId)` | Rejected if in an Active match. Mark removed. If in a Lineup → replace only that player (as above). Clear their Queue slots. Fill. |
| `setSittingOut(playerId, bool)` | Sitting out: reset Streak; if in a Lineup → replace only that player. Back in: Fill. |
| `endSession()` | Active matches → ended without score. Produce SessionSummary. |

All rejections are returned as typed results (e.g. `{ ok: false, reason: 'player-in-active-match' }`), not thrown.

## Queue helpers (pure)

- `queueWarnings(session, queue)` → list of: `unbalanced` (balance > 1), `third-in-a-row` (any player Streak ≥ 2), `repeat-partners` (a Team has partnered before), `sitting-out` (player), `on-court` (player in Active match, with Court number). Warnings never block, except `on-court` and incomplete Queue which disable Move.

## Score validation (pure)

Two integers ≥ 0, not equal, and the higher ≥ the Point system target (21/31).

## Summary (pure)

- `totalMatches` = Ended matches.
- `totalPlayers` = Session players (incl. removed) who played ≥ 1 Ended match.
- Duration = `endedAt − startedAt`.
- Wins = scored Ended matches won. Top winners: players with ≥ 1 win, sorted by wins desc, then played asc, then name; competition ranking (1, 1, 3); include everyone with place ≤ 3.

## Acceptance (unit tests, seeded rng)

- Hard rules hold across randomised simulations (e.g. 200 seeded runs of 12–30 players, 1–6 Courts, random start/end/remove/sit-out/queue moves): no player in two Courts; Lineups disjoint; every Match 4 distinct players.
- Rest: with enough players, nobody plays a 3rd consecutive Match; with exactly 4 players and 1 Court, they do (necessary).
- Fairness: players with fewer Recent matches are picked first; window differs for 21 vs 31.
- Balance: given 2 advanced + 2 beginners → split is (A+B) vs (A+B); impossible cases still produce a Lineup.
- New partners: repeated partnerships avoided when an equally fair alternative exists.
- Rehash returns a different Lineup when possible; same set → different split when only 4 Candidates.
- Rehash all: disabled with < 2 Idle Courts; differs from previous arrangement when possible; across many seeds, partner repeats are not worse than independent per-court picks.
- Queue move replaces only the conflicting player in other Lineups.
- Determinism: same input + same seed → same output.
- Summary ranking ties (1, 1, 3).
