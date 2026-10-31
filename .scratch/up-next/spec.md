# Spec: Up next in the Queues section

Status: resolved (implemented 2026-11-01)

Vocabulary per `GLOSSARY.md` (adds **Up next**).

## Problem

- Mid-session every Court is usually Busy. A Lineup only exists for an Idle Court, so nothing on the Active session page says who plays next.
- The Queues section is empty most of the evening: a dashed box with "Pick the next four players by hand…" for the Session host, "No queues right now." for everyone else.
- Players by the court keep asking "am I up soon?", and the app knows the answer but doesn't show it.

## Decisions

### 1. What Up next is

- The free Session players, in the order the app would pick them for the next Lineup. Free means not in an Active match, not Sitting out, not removed, and not in an Idle Court's Lineup (those already show on their Court).
- Players in a Queue stay listed, because a Queue doesn't hold its players.
- It's a forecast: players coming off court can still change who is picked. Nothing is stored or synced. Every device works it out from the Session it already has, so there's no Backend or Security Rules change.

### 2. Where it shows

- The first block inside the Queues section, above any Queue cards (and above the empty state when there are none). Subheading "Up next".
- The section keeps its "Queues" title and its jump bar label.
- The section is collapsible, open by default (Hide queues / Show queues). Collapsing it hides Up next too.
- Shown to everyone who can see the Active session: the Session host and read-only viewers (Players, other Organizers).
- **Hidden until the first Match of the Session has started.** At Start nobody has played, so the list would just be the whole roster. Until then the section looks as it does today.

### 3. Likely next: the app's real pick

- The first four rows are marked **Likely next**. They're the four the app would put in a Lineup if a Court freed up now, picked from the free players by exactly the rules of ADR-0009 (the same as Lineup, Rehash and Rehash all).
- Ties are settled the same way on every device, with no random tie-break, so the host and every Player see the same list and it doesn't change between renders.
- Inside the four, and for everyone after them, rows follow the waiting order (4).

### 4. Waiting order

The free players are ranked in the order the soft rules favour them:

1. Rests in a row at the limit (ADR-0009 rule 2), longest first.
2. Fairness: fewest Matches in the Fairness window, then fewest overall.
3. Longest Wait.
4. Joined the Session first.

Players on a Streak of 2 (a third Match in a row isn't allowed) go **last** whatever their counts, tagged "Resting".

The Likely next four come first, in this order among themselves; everyone else follows in this order.

### 5. Each row

- Name and Skill level, styled like the player rows elsewhere on the page.
- **"You"** on the row whose Session player is linked to the viewer's Account (same check as the Players section's "You").
- One reason tag: the strongest one that applies, in this order:
  1. **Resting**: on a Streak of 2.
  2. **Sat out N in a row**: Rests in a row at the limit.
  3. **Played N fewer**: N = the most Matches played this Session by any Session player who isn't Sitting out, minus this player's Matches. Shown when N ≥ 1. Active matches count.
  4. **Waiting M min**: their Wait, in whole minutes (shown at 1 min or more).
  5. No tag otherwise.

### 6. "Queue these four" (Session host only)

- A button under the Up next list. It adds a new Queue at the end of the Queues, holding exactly the Likely next four, split into the Teams the app would give them as a Lineup.
- The new Queue is an ordinary Queue: editable, removable, Move to court as usual.
- Hidden for read-only viewers and while fewer than four players are free.
- It can be tapped again. Queues may share players, so a second tap makes a second Queue with the same four.

### 7. Fewer than four free

- 1 to 3 free: list them (no Likely next marking, since the four isn't complete), with the note "The rest will come from whoever comes off court."
- Nobody free: "Everyone's on court or in a Lineup."

## Implementation notes

- Domain: add a pure `upNext(session, now)` in `src/domain/engine/` returning the ordered rows (player id, likely-next flag, reason) and the likely Teams. It reuses `freePlayerIds`, `makeEnv` and the selection in `select.ts`. `pickLineup` takes a `courtId` today, so pull out a variant that picks from a given candidate list with no Court. Use a fixed `rng` (as `queueWarnings` does: `() => 0`) for the tie-break. Unit tests cover the order, every reason tag, Resting last, the likely four matching what `fillLineups` would pick for a freed Court when nobody comes off court, and the hidden-before-first-Match rule.
- UI: an `UpNext` component in `src/features/session/queues/`, rendered at the top of `QueuesSection`. "Queue these four" goes through `actions.run` like Add queue.

## Out of scope

- Forecasting who comes back from court, or which Court frees first.
- A forecast per Busy Court.
- Tapping a player in Up next to put them in a Queue slot (Queue cards already have the picker).
- Changing how Lineups are picked.
- Notifications ("you're up next").

## E2E workflows

`e2e/session-queues.spec.ts`, new describe "Up next":

- Before any Match has started, the Queues section has no Up next. After a Match starts, Up next lists the free players, and players on court, Sitting out or in a Lineup are not in it.
- With 4 or more free players, the first four rows are marked Likely next. "Queue these four" adds a Queue holding exactly those four, and Move to court starts the Match with those Teams.
- With 1 to 3 free players, the list shows them with "The rest will come from whoever comes off court." and no "Queue these four". With nobody free, "Everyone's on court or in a Lineup."
- After a Match ends, players who played 2 in a row show at the bottom tagged "Resting".
- Up next stays above Queue cards after Add queue, and above the empty state when the Queues are removed again.

`e2e/emulator/shared-sessions.spec.ts`:

- The Player watching sees the same Up next (same names, same order, same Likely next four) as the host, sees their own row marked "You", and has no "Queue these four".
