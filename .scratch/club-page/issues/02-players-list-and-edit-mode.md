# 02 Players list and Players Edit mode, one page for both Roles

Status: ready-for-agent
Blocked by: 01
Spec: ../spec.md (Club page → Players, Players Edit mode)

## What

- One Club page for every Role: `ClubReadOnly.tsx` goes away. Edit buttons show only where `canEditClub`.
- **Players** section: heading with the count and **Edit**. Outside Edit mode a plain list in one card, rows ruled off, sorted by name: avatar, name, Organizer badge, "You" on the viewer's own row, Skill badge. No Account IDs. Rows are not links yet (issue 03). Empty note when there are no Club players.
- **Edit** turns the list into today's roster form (player editor, `@Account ID` linking, Roles, Unlink, last-Organizer rules, Enter-to-next-row, validation, offline rules). The heading's Edit becomes **Cancel** (throws away roster changes, no confirm). The footer pins Add player and Save only in Edit mode.
- Save stays on the Club page and leaves Edit mode. A failure stays in Edit mode with the message.
- While in Edit mode: the card's Edit, Make shared and the Danger zone are hidden; the session cards stay, with "Discard changes?" first when there are unsaved changes. Back with unsaved changes asks "Discard changes?"; outside Edit mode nothing asks.
- A Shared club changing under an open Edit mode behaves as today.
- Make shared and the Danger zone otherwise unchanged, below Players.
- Rename `e2e/club-edit.spec.ts` to `e2e/club-page.spec.ts`.

## E2E workflows

`e2e/club-page.spec.ts`, on chromium-mobile and webkit-mobile:
5. Edit → rename, change Skill level, remove one, add one → Save → still on the Club page, out of Edit mode, and the list reflects it after a reload. Edit → change something → Cancel → nothing changed.
6. Edit mode with unsaved changes → Back asks; Keep editing stays, Discard leaves without saving. Outside Edit mode Back leaves straight away.
7. In Edit mode an empty or duplicate player name blocks Save with a message.
10. A Player (the Role) sees no Edit on the card or on Players (update the read-only test in `e2e/club-roles.spec.ts`).
11. Delete club and the session cards behave as today (moved over from the old spec).

Update `e2e/club-roles.spec.ts`, `e2e/shared-clubs.spec.ts`, `e2e/make-shared-club.spec.ts` and the emulator specs that edit a roster: tap Edit on Players first, and Save stays on the Club page.
