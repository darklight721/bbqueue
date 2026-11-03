# Spec: Edit players — the @Account ID hint, row dividers, Account ID band, Role pill and column header

Status: done (01, 02, 03)
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

## Account ID band (issues 02, 03)

- Problem: on a linked row, only the Account ID chip is tinted, and the Role select sits outside the tint, so the Role doesn't read as belonging to the Account.
- The tint moves from the chip to the whole Account ID line, edge to edge: one rounded band behind the Account ID and the Role.
- Left of the band, two lines as the chip had: the Account ID, and under it (past the icon) "You" on the viewer's own row or the Unlink text button on anyone else's. Unlink is unchanged: accessible name "Unlink <name>", takes back a link that isn't saved yet (offline too), removes a saved one (online only, disabled offline), no confirm.
- Same colours as the chip had: `bg-base-200`; `bg-primary/10` on the viewer's own row; `bg-error/10` (with the struck-through Account ID) when the Account no longer exists.
- The band has vertical padding (`py-1.5`) and the same inset on the right, so the Role pill sits inside it, clear of its edges.
- The Account ID keeps its left edge in line with the name field's text.
- The helper lines under the band ("This Account no longer exists.", "The only Organizer.", a refused Role change) stay outside it, unchanged.
- The name line above is not tinted.

## Role pill (issues 02, 03)

- The Role `<select>` becomes a two-option pill toggle, "Player | Organizer", like the Skill level picker in a Session player's menu (`PlayerMenuSheet`): radios in a rounded-full track, with the chosen one as `btn-primary`, two equal halves.
- It starts at the Skill level column's left edge and reaches under Remove, up to the band's right inset (`ROW_SELECT_COLUMN` + gap + `ROW_ACTION_COLUMN`, `12.25rem`, less the inset). Field height (`h-10`), text at `0.8125rem`.
- The track contrasts with the band (e.g. `bg-base-100`), not `bg-base-200`, which would disappear on a grey band.
- Accessible name: a `radiogroup` "Role for <name>" with radios "Player" and "Organizer". Arrow keys move between them like any radio group. A visible focus ring, as in the Skill level picker.
- Behaviour unchanged: choosing a Role is a form edit saved with Save. Disabled when offline. No pill when the Account no longer exists (the space stays empty).
- Choosing Player on the only Organizer is refused as now: the pill stays on Organizer and "A Club needs at least one Organizer." shows. Player is not disabled ahead of time.

## Unlink icon (dropped in issue 03)

Issue 02 moved Unlink to a link-slash icon button under Remove, with "You" there on the viewer's own row. In use the pill touched the band's edges and the line felt crowded, so issue 03 puts Unlink and "You" back under the Account ID and gives the space under Remove to the pill. The icon is gone.

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

Issues 02 and 03: the existing Role workflows, now driven through the pill instead of a select. Every e2e spec that finds `combobox "Role for …"` switches to `radiogroup "Role for …"` and its radios (check / `toBeChecked`) on both the fake-Backend and emulator projects: `club-roles.spec.ts`, `make-shared-club.spec.ts`, `emulator/roles.spec.ts`, `emulator/make-shared-club.spec.ts`, `emulator/shared-clubs.spec.ts`, `emulator/delete-account.spec.ts`. `club-roles.spec.ts` also covers choosing a Role by tap on WebKit and Chromium, and the refusal on the only Organizer. Unlink keeps its accessible name, so its existing workflows ("Unlink takes back a link that isn't saved yet", "own row says You, and has no Unlink", "Unlink on a saved link, then Save") still cover it and must still pass. `club-roles.spec.ts` checks the pill starts under the Skill level and reaches under Remove. The band and the header are visual only (exempt).

## Acceptance

- Component tests (`ClubScreen.roles.test.tsx`, `ClubScreen.test.tsx`): an Organizer of a Shared club sees the hint; going offline swaps it for the offline note; a Local club's Edit players has no hint.
- `pnpm test`, lint and the full `pnpm e2e` pass.
