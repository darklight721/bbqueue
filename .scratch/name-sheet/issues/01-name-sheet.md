# 01 Rename the Account and the Club in a sheet

Status: done
Blocked by: none
Spec: ../spec.md

## What

- Add `NameSheet` in `src/components/` on `Modal` (spec decisions 2–6): title focused on open (`focusTitle`), reserved message line, full-width Save, × labelled "Close", locked while saving. The caller validates and saves.
- Account page (`AccountSettingsScreen` → `NameSection`): Edit name opens the sheet titled "Edit name", field "Your name". Drop the avatar's live initials preview. Keep "Name saved" and the offline-disabled pill.
- Club page (`ClubCard`): Edit club name opens the sheet titled "Edit club name", field "Club name". Announce "Club renamed" on success.
- Remove `CourtCardNameForm` and `CourtCardError` from `src/components/CourtCard.tsx`.
- Reword `Modal`'s `closeLabel` comment to the × rule in spec decision 8.
- Update unit tests (`AccountSettingsScreen.test.tsx`, `ClubScreen*.test.tsx`) that drive the inline field.

## E2E workflows

All of the spec's `## E2E workflows` (1–8), in the same commit: rework the rename tests in `e2e/account-settings.spec.ts` and `e2e/club-page.spec.ts`, and the emulator rename tests, to drive the sheet.
