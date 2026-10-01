# Queueing rule priority: Rest before fairness

Hard rules: a Match has exactly four Session players in two Teams of two, and nobody is on two Courts at once. Soft rules are applied in strict priority order:

1. **Rest**: no third back-to-back Match. Graded: the longer a player's Streak beyond one, the stronger the preference to rest them (key `max(0, streak − 1)`), so when several players are over the limit, the longest Streak rests first.
2. **Fairness**: fewest Matches in the Fairness window, then fewest overall, then **longest Wait** since their last Match.
3. **Team balance**: Skill totals differ by ≤ 1.
4. **New partners**: fewest repeated partnerships.

Players are chosen using Rest and Fairness (Wait included); the three possible Team splits of those four are then ranked by Team balance and New partners. Rest outranks fairness deliberately: a tired player going on a third time in a row feels worse courtside than a small imbalance in who has played most recently.

Latecomers are not handicapped: a player who joins mid-Session has played least and is picked soon; the Fairness window limits how long that advantage lasts. Re-adding a removed player by the same name restores them (and their history) rather than creating a new player.
