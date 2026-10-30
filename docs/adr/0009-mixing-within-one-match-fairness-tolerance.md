# Mixing within a one-Match Fairness tolerance

Supersedes the priority order in ADR-0003. The hard rules, Rest and the latecomer principle still stand.

Strict Fairness (fewest Matches in the Fairness window, then fewest overall, then longest Wait) locked Sessions into fixed groups of four. Examples: 8 players on 1 Court, 12 on 2 Courts and 16 on 3 Courts when the Courts started at different times. Whoever sat out always had strictly fewer Matches, so the same four came back again and again, and players in different groups never shared a Match. To mix the groups, someone who just played has to play again ahead of someone who sat out. We decided to allow that within a one-Match tolerance, and to let Mixing decide among players who are level.

Soft rules, in strict priority order:

1. **Rest**: no third back-to-back Match; longer Streaks rest first (unchanged).
2. **Rests in a row**: a player whose Rests in a row reach 2 × the number of Courts is picked before Mixing gets a say; the longest go first.
3. **Fairness, with a one-Match tolerance**: a player is *owed a place* before another if they have played 2+ fewer Matches in the Fairness window, or the same or fewer in the window and 2+ fewer overall. Nobody is left out for a player they are owed a place before. Players within one Match of each other are level.
4. **Team balance exists**: prefer four that can be split into balanced Teams.
5. **Mixing**: fewest past meetings (Partners or Opponents) summed over the four's six pairs, counted over the whole Session.
6. Exact Fairness counts (window, then overall), then **longest Wait**.
7. **New partners**, then exact Team balance, then random.

This applies wherever the app picks players: a Lineup, Rehash, Rehash all, and replacing one player in a Lineup.

## Consequences

- The guarantee is "nobody is passed over for someone 2+ Matches ahead", not "nobody is ever 2+ Matches behind". A gap of 2 can appear briefly, for example when one player sits out while another plays two in a row. The behind player is then owed the next place, so the gap does not keep growing. The stronger guarantee is exactly the old strict rule, which is what caused the lock.
- Wait drops below Mixing. Without the Rests in a row rule, 10 players on 1 Court could leave one player sitting out three rounds in a row; with it, the most stays two.
- Latecomers: a newcomer is owed a place before anyone who has played 2+ Matches, so they are in the next Lineup. Their overall deficit only counts against players who have played at least as much in the Fairness window. Catch-up therefore runs at most two Matches on, one off, and stops once they are within one Match of the others.

## Considered options

- **Mixing only breaks exact ties**: changes nothing, because the locked groups are never tied.
- **Tolerance measured from the lowest count**: a single low player (often a latecomer) sets the lowest count and makes everyone else strict again.
- **Counting pairs who have met at least once** instead of total meetings: stops making a difference once most pairs have met, so the groups form again.
