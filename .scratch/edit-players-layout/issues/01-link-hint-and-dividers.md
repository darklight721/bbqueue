# 01 Edit players: @Account ID hint and row dividers

Status: ready-for-agent
Spec: ../spec.md

## What

- `src/features/club-edit/EditPlayersScreen.tsx`: above the list in the Players section, when `linking` and not offline, a note with `LinkIcon`: "To link a player to their Account, type **@** and their Account ID in the name field. They'll find it on their Account page." Same box as the offline note. Not dismissible. Placeholder unchanged.
- The rows `ul`: `divide-y divide-base-300` with vertical padding per row instead of `gap-3`/`gap-4`; none above the first or below the last row.
- Component tests: hint for a Shared club's Organizer, swapped for the offline note when offline, absent on a Local club.

## E2E workflows

None — copy and styling only (see the spec).

## Out of scope (later)

- The Club page's roster, a per-row Link button, a dismissible hint, a Make shared hint on Local clubs.
