# 05 New club as a sheet on the Clubs page

Status: ready-for-agent
Blocked by: 02
Spec: ../spec.md (New club sheet)

## What

- The Clubs page's Add club button (and its empty state) opens a bottom sheet (`Modal`) titled "New club": one Club name field and **Create club**. ✕, Escape or the backdrop close it without creating anything. Name checks as today, under the field.
- Create club makes the Club as today (`createClub`: Shared while signed in, with the creator's own row as Organizer; Local otherwise), closes the sheet, and opens the new Club page in Players Edit mode with an empty row focused (after the creator's row on a Shared club). A failure keeps the sheet open with the message.
- Remove the `/clubs/new` route and the New club branch of the Club page (`ClubEditor` with `club === null`, `createsShared`, the New club rules in `changeRole` and `keepRow`). `/clubs/new` redirects to `/clubs` (replace).
- Append a dated note to `docs/adr/0008-new-shared-club-may-link-accounts-on-creation.md`: New club no longer links other Accounts on creation, because Players Edit mode opens straight away and there is one roster editor; the rule allowing links in the creating batch stays (harmless, still used for the creator's row).

## E2E workflows

`e2e/clubs.spec.ts`, on chromium-mobile and webkit-mobile (move the New club tests out of `club-page.spec.ts`):
1. Add club → sheet → name → Create club → Club page in Players Edit mode with an empty, focused row → add 3 players of different Skill levels → Save → Back → the Clubs list shows "3 players".
2. An empty, too long or duplicate name blocks Create with a message; ✕ closes the sheet and nothing is created.
3. `/clubs/new` redirects to `/clubs`.

Update every e2e (and `e2e/fixtures.ts` helpers, `e2e/emulator/` specs) that creates a Club through `/clubs/new`.
