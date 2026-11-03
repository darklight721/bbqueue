# Spec: Edit players — the @Account ID hint, row dividers, Account ID band, Role pill and column header

Status: done
Depends on: edit-players, accounts

Screens (changed): `/clubs/:clubId/players` (Edit players). The Club page's roster is unchanged.

Vocabulary per `GLOSSARY.md`: **Club player**, **Account**, **Account ID**, **Organizer**, **Shared club**, **Local club**, **Skill level**, **Role**. No new terms.

## Problem

- Organizers only learn that a name field takes an `@Account ID` from its placeholder, "Name or @Account ID". The placeholder disappears once a row has a name, so on an existing roster the way to link an Account can't be seen anywhere.
- Rows are separated only by a gap. A linked row is two lines (the name row, then the Account ID and Role line), so it isn't clear which player a linked line belongs to.

## The @Account ID hint

- A note at the top of the Players section, above the list (or above "No players yet"): "To link a player to their Account, type **@** and their Account ID in the name field. They'll find it on their Account page."
- Styled like the offline note there (rounded `bg-base-200` box, small muted text), with the `LinkIcon` in front. `@` is bold.
- Shown only when the viewer may link Accounts (an Organizer of a Shared club) and isn't offline. Offline, the existing "You're offline. Linking Accounts and changing Roles need a connection." note takes its place. A Local club never shows it.
- Always shown: it can't be dismissed, and nothing is stored on the device.
- The name field's placeholder "Name or @Account ID" stays.

## Row dividers

- A thin `divide-base-300` line between rows of the list, with vertical padding in place of the gap, so each player (name row, its messages and its linked line) reads as one block.
- On every roster on this page, with linking or not (Local clubs too). No line above the first row or below the last.
- Row contents, columns and widths don't change.

## Account ID band (issue 02)

- Problem: on a linked row, only the Account ID chip is tinted, and the Role select sits outside the tint, so the Role doesn't read as belonging to the Account.
- The tint moves from the chip to the whole Account ID line, edge to edge: one rounded band behind the Account ID, the Role and Unlink (in the column under Remove).
- The band is one line at field height (`h-10`, like the Role pill): the Account ID, the Role, then under Remove either Unlink or, on the viewer's own row (which has no Unlink), a small "You" (`text-xs font-semibold text-primary`). "You" sits there rather than after the Account ID so the Account ID keeps the room on narrow screens (at 320px it was cut to one letter). No second line inside the band.
- Same colours as the chip had: `bg-base-200`; `bg-primary/10` on the viewer's own row; `bg-error/10` (with the struck-through Account ID) when the Account no longer exists.
- The Account ID keeps its left edge in line with the name field's text, and the Role keeps the Skill level column, so Roles still line up under Skill levels.
- The helper lines under the band ("This Account no longer exists.", "The only Organizer.", a refused Role change) stay outside it, unchanged.
- The name line above is not tinted.

## Unlink icon (issue 02)

- Unlink moves from a text link under the Account ID to an icon button in the Remove column, inside the band, so it sits under Remove.
- A new link-slash icon (`LinkIcon`'s chain with a diagonal stroke through it), not ✕, so it can't be mistaken for Remove directly above.
- A ghost square button the width of the Remove column and as tall as the band (`w-12 h-10`), with the icon in Remove's colour (`text-base-content/70`), red on hover. Red all the time when the Account no longer exists.
- Accessible name unchanged: "Unlink <name>".
- States unchanged: none on the viewer's own row ("You" takes its place). On a link that isn't saved yet it takes the link back, clears the name and focuses the name field, offline too. On a saved link it is disabled while offline (the offline note at the top explains). No confirm: it is a form edit until Save, and Discard undoes it.

## Role pill (issue 02)

- The Role `<select>` becomes a two-option pill toggle, "Player | Organizer", like the Skill level picker in a Session player's menu (`PlayerMenuSheet`): radios in a rounded-full track, with the chosen one as `btn-primary`.
- It sits in the Skill level column (`ROW_SELECT_COLUMN`, `8.75rem`), at field height (`h-10`, same as the select above it), with text at `0.8125rem`. "Organizer" must fit without truncating at 320px viewport width, so each side grows from its label's width rather than taking half.
- The track contrasts with the band (e.g. `bg-base-100`), not `bg-base-200`, which would disappear on a grey band.
- Accessible name unchanged: a `radiogroup` "Role for <name>" with radios "Player" and "Organizer". Arrow keys move between them like any radio group. A visible focus ring, as in the Skill level picker.
- Behaviour unchanged: choosing a Role is a form edit saved with Save. Disabled when offline. No pill when the Account no longer exists (the column stays empty for alignment).
- Choosing Player on the only Organizer is refused as now: the pill stays on Organizer and "A Club needs at least one Organizer." shows. Player is not disabled ahead of time.

## Column header (issue 02)

- A header line above the list: "Name" over the name fields, "Skill level" over the Skill level column, with the Remove column left blank so they line up.
- Styled like the Skill level legend in a Session player's menu: `text-xs font-bold tracking-[0.14em] uppercase text-base-content/60`.
- Shown only when the roster has at least one row (not over "No players yet"), on every roster on this page (Local clubs too). It goes under the @Account ID hint or offline note.
- No "Role" heading: the pill's own words say what it is.
- Not sticky. Visual only (`aria-hidden`): every field already has its own label.

## Out of scope (later)

- The Club page's roster.
- A per-row "Link Account" button, or a dismissible hint.
- A hint on Local clubs about Make shared.

## E2E workflows

Issue 01: None — copy and styling only. Whether the hint shows depends only on the Role, Shared vs Local and online state, which Vitest component tests on Edit players prove; the dividers are a purely visual tweak.

Issue 02: the existing Role workflows, now driven through the pill instead of a select. Every e2e spec that finds `combobox "Role for …"` switches to `radiogroup "Role for …"` and its radios (check / `toBeChecked`) on both the fake-Backend and emulator projects: `club-roles.spec.ts`, `make-shared-club.spec.ts`, `emulator/roles.spec.ts`, `emulator/make-shared-club.spec.ts`, `emulator/shared-clubs.spec.ts`, `emulator/delete-account.spec.ts`. `club-roles.spec.ts` also covers choosing a Role by tap on WebKit and Chromium, and the refusal on the only Organizer. Unlink keeps its accessible name, so its existing workflows ("Unlink takes back a link that isn't saved yet", "own row says You, and has no Unlink", "Unlink on a saved link, then Save") cover the icon button unchanged and must still pass. The band and the header are visual only (exempt).

## Acceptance

- Component tests (`ClubScreen.roles.test.tsx`, `ClubScreen.test.tsx`): an Organizer of a Shared club sees the hint; going offline swaps it for the offline note; a Local club's Edit players has no hint.
- `pnpm test`, lint and the full `pnpm e2e` pass.
