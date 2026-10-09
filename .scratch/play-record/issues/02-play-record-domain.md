# 02 Play record calculations

Status: done
Blocked by: 01
Spec: ../spec.md (Domain)

## What

Pure functions in `src/domain/` (for example `src/domain/playRecord.ts`):

- `clubPlayRecord(endedSessions, clubId, clubPlayerId)` and `accountPlayRecord(endedSessions, clubs, accountId)`. The Account version collects every Club player row currently linked to the Account.
- Output:
  - headline numbers: matches played, wins, losses, Win rate (or none), Sessions played;
  - per-Session entries: Ended session id, date, Club name, wins, losses, matches played, Win rate or none, Standings place via `rankStandings`;
  - Partners: most frequent and best (at least 3 matches together with at least one scored; ties by matches together, then name). Guests are left out. Each Partner carries its `clubId` and `clubPlayerId`;
  - display name: the current roster name, or else the name from the latest Ended session.
- `StandingsEntry` gains the Session player's `clubPlayerId` (or `null`) so Standings rows can become links.

## Acceptance

Unit tests for every rule under "Acceptance → Unit tests for the domain" in the spec.

## E2E workflows

None — pure domain logic (`src/domain/**`), covered by unit tests.
