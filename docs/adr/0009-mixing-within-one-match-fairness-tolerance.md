# Mixing within a one-Match Fairness tolerance

Supersedes the priority order in ADR-0003. The hard rules, Rest and the latecomer principle still stand.

Amended 2026-10-30: rule 2's limit is now max(2 × Courts, floor(players / 4)) instead of 2 × Courts. With the old limit, 12, 16 and 20 players on 1 Court and 24 on 2 Courts locked into fixed groups. See Consequences and Considered options.

Strict Fairness (fewest Matches in the Fairness window, then fewest overall, then longest Wait) locked Sessions into fixed groups of four. Examples: 8 players on 1 Court, 12 on 2 Courts and 16 on 3 Courts when the Courts started at different times. Whoever sat out always had strictly fewer Matches, so the same four came back again and again, and players in different groups never shared a Match. To mix the groups, someone who just played has to play again ahead of someone who sat out. We decided to allow that within a one-Match tolerance, and to let Mixing decide among players who are level.

Soft rules, in strict priority order:

1. **Rest**: no third back-to-back Match; longer Streaks rest first (unchanged).
2. **Rests in a row**: a player whose Rests in a row reach the limit is picked before Mixing gets a say; the longest go first. The limit is the larger of 2 × the number of Courts and a quarter of the players (rounded down). Players are the Session players who are not removed and not Sitting out, counted again at every pick.
3. **Fairness, with a one-Match tolerance**: a player is *owed a place* before another if they have played 2+ fewer Matches in the Fairness window, or the same or fewer in the window and 2+ fewer overall. Nobody is left out for a player they are owed a place before. Players within one Match of each other are level.
4. **Team balance exists**: prefer four that can be split into balanced Teams.
5. **Mixing**: fewest past meetings (Partners or Opponents) summed over the four's six pairs, counted over the whole Session.
6. Exact Fairness counts (window, then overall), then **longest Wait**.
7. **New partners**, then exact Team balance, then random.

This applies wherever the app picks players: a Lineup, Rehash, Rehash all, and replacing one player in a Lineup.

## Consequences

- The guarantee is "nobody is passed over for someone 2+ Matches ahead", not "nobody is ever 2+ Matches behind". A gap of 2 can appear briefly, for example when one player sits out while another plays two in a row. The behind player is then owed the next place, so the gap does not keep growing. The stronger guarantee is exactly the old strict rule, which is what caused the lock.
- Wait drops below Mixing. Without the Rests in a row rule, 10 players on 1 Court could leave one player sitting out three rounds in a row. With it, on 1 Court nobody sits out more than max(2, floor(players / 4)) rounds in a row. With 5 to 11 players that is still two, as before; it is 3 at 12 players, 4 at 16 and 5 at 20.
- Why the limit grows with the players (amended 2026-10-30): with 4k players on 1 Court, a limit of k − 1 rounds sitting out can only be met by fixed groups. In any k rounds in a row there are 4k places for 4k players, so each player has to play exactly once per k rounds. The old limit of 2 × Courts was exactly that tight at 12 players on 1 Court, and below the average from 13 players up, where "longest first" becomes first-in-first-out and keeps whoever sat out together together. The four who sat out together reach the limit together, are exactly enough to fill the Lineup, so the pick is forced and Fairness and Mixing never get a say. In the sweep (20 runs per case) only 27%, 20% and 16% of pairs ever shared a Match at 12, 16 and 20 players on 1 Court, and 13% at 24 players on 2 Courts. With the new limit it is 97–100% in every case, because a player may now sit out about as long as the average wait before being forced in, and Mixing decides in between.
- 11 players on 1 Court (93–98% of pairs, same as before) is not changed by this amendment, since its limit stays at 2.
- Latecomers: a newcomer is owed a place before anyone who has played 2+ Matches, so they are in the next Lineup. Their overall deficit only counts against players who have played at least as much in the Fairness window. Catch-up therefore runs at most two Matches on, one off, and stops once they are within one Match of the others.

## Considered options

- **Mixing only breaks exact ties**: changes nothing, because the locked groups are never tied.
- **Tolerance measured from the lowest count**: a single low player (often a latecomer) sets the lowest count and makes everyone else strict again.
- **Counting pairs who have met at least once** instead of total meetings: stops making a difference once most pairs have met, so the groups form again.
- **Force in only the single most overdue player** (the rest of those at the limit go back into the field for Fairness and Mixing to decide): also unlocks 12, 16 and 20 on 1 Court and 24 on 2 Courts (97–100% of pairs). But it breaks the old guarantee at 8–11 players on 1 Court (longest sit-out 3, 3, 3 and 4 rounds instead of 2), and sit-outs reach 4–5, 6 and 7–8 rounds at 12, 16 and 20 players (the limit would be 3, 4 and 5), and 7–8 rounds at 24 players on 2 Courts.
- **Force players in only when fewer are at the limit than there are places**: also unlocks the same cases (97–100% of pairs), but at 10 and 11 players on 1 Court the longest sit-out rises to 3 and up to 5 rounds, and it reaches up to 6, 8 and 10 rounds at 12, 16 and 20 players and up to 10 at 24 players on 2 Courts, because when many players are overdue nobody is forced in.
- **The new limit, max(2 × Courts, floor(players / 4))**: chosen. It was the only variant where every sit-out stayed within its own limit (max 3, 4, 5 on 1 Court and 6 on 2 Courts at 12, 16, 20 and 24 players), it leaves 5 to 11 players on 1 Court unchanged, and spread and Streak stayed at 2 or less at every pick in all variants.
