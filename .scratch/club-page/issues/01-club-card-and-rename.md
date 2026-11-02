# 01 Club card, renamed on its own

Status: ready-for-agent
Blocked by: none
Spec: ../spec.md (Club page → Club card)

## What

- On `/clubs/:clubId`, for everyone who can see the Club (both `ClubEditor` and `ClubReadOnly` for now): the top bar title becomes "Club", and the page opens with the court-green Club card used on the Account page and Stats: pill "Club", the Club name large and uppercase, and the one line ("Shared club · You're an Organizer" / "Shared club · You're a Player" / "This device only" / nothing). No number tiles. Pull the card shell out of `AccountSettingsScreen` and `PlayRecordScreen` into a shared component rather than copying it a third time.
- **Edit** on the card (only where `canEditClub`): the name becomes a field with Save and Cancel, as `NameSection` on the Account page does it. Save renames the Club and nothing else (a Local club: the device copy; a Shared club: one `rename` change). Same name checks as today; errors on the card; a server failure keeps the field open with the message. Escape or Cancel goes back without saving.
- The Club name field leaves the Edit club form for existing Clubs. The form's Save now covers only the roster, and "Discard changes?" only counts roster changes. Save still goes back to `/clubs` for now (issue 02 changes that).
- `/clubs/new` keeps its Club name field until issue 05 replaces it.

## E2E workflows

`e2e/club-edit.spec.ts` (renamed to `club-page.spec.ts` in issue 02), on chromium-mobile and webkit-mobile:
4. Card Edit → change the name → Save → the card shows it, also after a reload; Edit → Cancel keeps the old name; a duplicate name shows an error on the card. Move the existing "rename to a different-cased version of its own name" test here.

Emulator (`e2e/emulator/shared-clubs.spec.ts`):
12. An Organizer renames a Shared club from the card on one device; the other device's Club page shows the new name.

Update every existing e2e that renames a Club through the old form field.
