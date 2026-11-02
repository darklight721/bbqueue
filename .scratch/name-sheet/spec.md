# Spec: Rename in a sheet, not on the court card

Status: ready-for-agent
Depends on: club-page (Club card), accounts (Account page)

Vocabulary per `GLOSSARY.md`. No glossary change: this is UI only.

## Problem

- On the Account page and the Club page, Edit on the court-green card turns the name into a field, a message line and Save/Cancel inside the card. The card grows, and everything under it jumps down: the Account ID, the help text and Your stats on the Account page; the session cards and Players on the Club page. The Edit pill disappears while editing.
- Every other name form in the app is already a sheet (New club, the Welcome name form, Add players). The rename on the card is the odd one out, with its own green field and red-pill error styling.

## Decisions

### 1. Both renames move to a bottom sheet

- The Account name (Account page) and the Club name (Club card on the Club page) are edited in a sheet. The card never changes shape: it shows the name and the Edit pill, nothing else.
- The pill is unchanged: pencil, "Edit", accessible name "Edit name" / "Edit club name". On the Account page it is still turned off while offline, with "Changing your name needs a connection."
- `CourtCardNameForm` and `CourtCardError` are removed.

### 2. One shared `NameSheet`

- A single sheet component in `src/components/` built on `Modal`: the field, one reserved message line, Save and the ×, and the lock while saving.
- As with `CourtCardNameForm` today, the caller checks the name and does the saving; the sheet only shows the draft, the name's own error and any save failure.

### 3. Titles and labels

| | Sheet title | Field label |
|---|---|---|
| Account page | Edit name | Your name |
| Club page | Edit club name | Club name |

The title matches the Edit pill's accessible name. The Account field keeps `autoComplete="name"`.

### 4. Look

- The standard light sheet, as New club: a normal `input-lg`, the error as plain red text on the reserved line (not the red pill), no court-green styling.
- **Save** is the large full-width primary button on its own row, like "Create club".
- No Cancel button. A round **×** in the top corner, labelled "Close" (`Modal`'s `closeLabel`), as on New club.

### 5. Keyboard

- Opening the sheet focuses the field with the caret at the end, so the keyboard comes up on the Edit tap (as New club does, not `focusTitle`).
- Check on a small iPhone (SE size) that Save stays above the keyboard. If it does not, fall back to `focusTitle`.
- Enter saves. Saving puts the keyboard away so the busy state and the result are in view.

### 6. Closing, saving and failing

- ×, Escape and a backdrop tap close the sheet without saving.
- While saving: the field is read-only, Save shows "Saving…", and ×, Escape and the backdrop do nothing (as New club while creating).
- A name with a problem (empty, too long, a duplicate Club name ignoring case) keeps the sheet open with the message under the field and focus in the field. Same checks as today; a Club may take its own name in a different case.
- A save that fails (server, connection) keeps the sheet open with the message under the field. Save is not turned off live if the connection drops while the sheet is open; it fails with "You're offline. Connect and try again."
- An unchanged name just closes the sheet.
- Success closes the sheet and returns focus to the Edit pill. The Account page announces "Name saved"; the Club page now announces "Club renamed".

### 7. Account avatar

The avatar on the Account card no longer previews the new initials while typing. It changes once the name is saved.

### 8. When a sheet gets a × and when Cancel

Reword `Modal`'s `closeLabel` comment to the rule: a × is for a sheet with one field and one full-width main button (New club, Edit name, Edit club name). Sheets with several choices keep Cancel (the player menu, Add players, the Rehash sheets): unchanged.

## Out of scope

- No Backend, storage or Security Rules change. Renaming still goes through `backend.renameAccount` and `saveClub`.
- The session sheets keep Cancel.
- No change to Stats' court card (it has no Edit).

## E2E workflows

On `chromium-mobile` and `webkit-mobile` unless marked otherwise. Rework the existing rename tests rather than adding parallel ones; the sheet is a `dialog`, so scope locators to it instead of the card.

`e2e/account-settings.spec.ts`:

1. Edit name → the "Edit name" sheet opens with "Your name" focused and filled → change the name → Enter saves → the sheet closes, the card shows the new name, focus is on Edit name, and the name survives a reload (avatar initials on Home too).
2. ×, Escape and a backdrop tap each close the sheet without saving. An empty name keeps the sheet open with "Enter a name" and the field invalid and focused.
3. Open the sheet, go offline, Save → "You're offline. Connect and try again." under the field and the sheet stays open; back online, Save works. (Edit turned off while offline stays as today.)

`e2e/club-page.spec.ts`:

4. Edit club name → the sheet opens with "Club name" focused → change it → Save → the card shows the new name, also after a reload; the roster is unchanged.
5. × and Escape keep the old name. A duplicate name ("tuesday CREW" against "Tuesday Crew") shows "Club name already used" in the sheet and isn't saved. A different-cased version of its own name is allowed.
6. A Player (the Role) sees no Edit on the Club card (unchanged).

Emulator (`e2e/emulator/shared-clubs.spec.ts` or `roles.spec.ts`; `e2e/emulator/account.spec.ts`):

7. An Organizer renames a Shared club through the sheet on one device; the other device's Club page shows the new name.
8. Update any emulator test that renames the Account through the old inline field.

Not tested: that the card keeps its height (visual).
