# 01 Save the Club player id on Ended session players

Status: done
Spec: ../spec.md (Storage)

## What

- Add `clubPlayerId: string | null` to `EndedSessionPlayer` (`src/domain/types.ts`). Copy it from `SessionPlayer.clubPlayerId` where the Session is slimmed (`src/domain/engine/endedSession.ts`).
- Reading must accept older records without the field and treat it as `null`. That covers device storage (`src/storage/store.ts`) and the server parser (`parseEndedSession` in `src/backend/firebaseSessions.ts`), plus any local, fake or in-memory Backend parsers.
- Don't save the Account ID. No Security Rules change.
- Update ADR-0005's list of what the slimmed copy keeps.

## Acceptance

- Unit: slimming keeps `clubPlayerId` (Club player → id, Guest → `null`); saving and reading back on the device keeps it; an old record without it reads as `null`; the server copy keeps it (Backend contract test).

## E2E workflows

None — this is a storage change with no visible effect. It is covered by unit and contract tests; tickets 03 and 04 exercise it end to end.
