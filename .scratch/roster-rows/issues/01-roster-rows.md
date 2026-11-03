# 01 Roster rows: Last played, link icon, inline Skill, sort

Status: done
Spec: ../spec.md

## What

- Club page roster rows (`src/features/club-edit/Roster.tsx`): drop the avatar; line 1 is name, `LinkIcon` on linked rows, compact `sm` Skill badge, "You", chevron; line 2 is `Organizer` and/or `Last played Fri, 2 Oct` (year added when not the current year), or nothing. No match count or Win rate. Accessible description per the spec.
- `clubLastPlayed` in `src/domain/playRecord.ts` (replacing `clubRosterFigures`) reports each Club player's Last played (the latest `startedAt` of an Ended session of the Club in which they played an Ended match) instead of played/wins/losses/Win rate.
- Move `SortControl` out of `src/features/session/players/PlayersSection.tsx` into a generic component in `src/components/`, used by the Session page (unchanged look) and the Club page (Name | Last played).
- Club page sort: shown only when someone on the roster has a Last played, otherwise by Name; Last played sorts most recent first, ties by name, never-played last by name; remembered under `bq:v1:roster-sort` (default Name, invalid → Name; not overwritten while hidden). Own row not pinned.

## E2E workflows

All of the spec's E2E workflows (1–3), in `e2e/club-page.spec.ts`, replacing the matches-and-Win-rate row test. `e2e/session-players.spec.ts` must still pass after the sort control moves.

## Out of scope (later)

- Edit players rows, Stats' Partners avatar.
- Active session counting toward Last played.
- More sort options, pinning the own row.
