# 01 — Session shell + Courts

Status: ready-for-agent
Spec: ../spec.md (sections 1, 2, Score dialog, Player display rule)

## Scope

- `/session` route: redirect to `/` when no saved Session; top bar (Back → `/`, Session name, Point system badge).
- Screen structure with section slots for Courts, Queues, Players, History, End session. Later tickets fill in the slots.
- A `useSessionActions` hook (or similar) that runs engine operations with `{ now: Date.now(), rng: Math.random }`, saves via `setSession` on every change, and turns rejection reasons into short user messages.
- A shared `PlayerChip` showing name, Skill badge and matches played, computed once per render via `allPlayerStats`.
- Courts section:
  - Court cards for Busy courts (Teams, live mm:ss timer from `startedAt`, End match, Remove match with a confirm) and Idle courts (Lineup or "Waiting for players", Rehash, Start match).
  - Remove court, disabled while Busy with a hint.
  - Add court, disabled at 10.
  - Rehash all, enabled only when ≥ 2 Idle courts.
- Score dialog: Save with validation, End without score, Cancel.

## Acceptance

- Spec e2e bullets for: Lineups being disjoint; start match and timer; end with score; end without score; remove match; Rehash and Rehash all; add and remove court; reload restoring state and timer; Back → Home shows Resume.
- RTL tests for the score dialog validation and the Court card states.
