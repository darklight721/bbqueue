# 03 — Queues section

Status: done
Blocked by: 01
Spec: ../spec.md (section 3)

## Scope

- Queue cards with Team A and Team B slots filled by hand. Tapping a slot opens a player picker sheet: non-removed players alphabetically, excluding players already in this Queue, each with a status (On court N / In lineup court N / Sitting out / Free).
- Non-blocking warning badges from `queueWarnings`.
- One **Move to court** button per Court, enabled or disabled through `canMoveQueue`, showing the reason when disabled (e.g. "Ana is on court 1").
- **Remove queue** and **Add queue**.
- Queues don't hold players: the same player can be in a Lineup and in other Queues.

## Acceptance

- Fill 4 slots and move the Queue to an Idle court: the match starts with those Teams and the Queue disappears.
- Move is disabled for a Busy court, an incomplete Queue, or a player on court (with the reason shown).
- A Lineup on another court that contained a queued player has only that player replaced.
