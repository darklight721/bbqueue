# 02 — Players section

Status: ready-for-agent
Blocked by: 01
Spec: ../spec.md (section 4)

## Scope

- Lists all non-removed Session players alphabetically, each shown with `PlayerChip` and a status chip (On court N / In lineup court N / Sitting out / Free).
- **Sit out / Back in** toggle. When the player is on court, show "Sitting out after this match" (ADR-0003, engine `setSittingOut`).
- **Remove** is blocked while the player is in an Active match with "End or remove their match first"; otherwise it asks for confirmation.
- **Add player**: the shared `AddPlayerForm`, with "Save to club" (unchecked by default) shown only when the Session has a Club. Checking it also appends the player to the Club. Adding the name of a removed player restores them.

## Acceptance

- Sitting out removes the player from a Lineup, and a replacement fills in.
- Sitting out while on court shows "Sitting out after this match", and the player isn't picked again after that match.
- Remove is blocked while on court.
- An added player appears and can be picked.
- With "Save to club" checked, the player is in the Club afterwards.
