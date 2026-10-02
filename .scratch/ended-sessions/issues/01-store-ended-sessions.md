# 01 — Store Ended sessions + Top winners tie-break

Status: done
Spec: ../spec.md (Domain, Storage)

## Scope

- `EndedSession` type in `src/domain/types.ts`. Slimming function in the engine.
- `endSession` returns `EndedSession | null`. `buildSummary(ended: EndedSession)` is derived and uses the new ranking (wins → fewer losses → more played).
- Storage key `bq:v1:ended-sessions` with the 50-cap, quota retry and removal of `bq:v1:summary`. Store API `useEndedSessions` / `getEndedSessions` / `addEndedSession`; summary slot/hooks removed.
- Keep the app compiling: minimal call-site updates (EndSessionSection, SessionSummaryScreen reading the summary from the Ended session). Route changes belong to 02.

## Acceptance

- Unit tests per spec "Acceptance → Unit". `pnpm` typecheck + unit tests green.
