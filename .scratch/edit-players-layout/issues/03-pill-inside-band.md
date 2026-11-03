# 03 Edit players: the Role pill inside the band, under Remove too; Unlink back under the Account ID

Status: done
Spec: ../spec.md

## What

Follow-up to 02, after seeing it on a phone: the pill touched the band's top and bottom edges, and the Unlink icon took the space under Remove.

- `src/features/club-edit/AccountLinkSection.tsx` (`LinkedLine`): the band gets `py-1.5` and the same inset on the right, so the pill sits inside it. Unlink (text button, "Unlink <name>") and "You" go back under the Account ID, as before 02. The pill's column runs from the Skill level column's left edge to under Remove (`12.25rem` less the inset), with equal halves.
- `src/components/icons.tsx`: `UnlinkIcon` removed (no longer used).
- Tests: the component test checks the pill's wider column; `club-roles.spec.ts` checks the pill starts under the Skill level and reaches under Remove.

## E2E workflows

The Role and Unlink workflows from 02 still cover it (accessible names unchanged). The pill's position is checked in `club-roles.spec.ts` on both browsers.
