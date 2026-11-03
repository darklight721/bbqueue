# Spec: Edit players — the @Account ID hint and row dividers

Status: ready-for-agent
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

## Out of scope (later)

- The Club page's roster.
- A per-row "Link Account" button, or a dismissible hint.
- A hint on Local clubs about Make shared.

## E2E workflows

None — copy and styling only. Whether the hint shows depends only on the Role, Shared vs Local and online state, which Vitest component tests on Edit players prove; the dividers are a purely visual tweak.

## Acceptance

- Component tests (`ClubScreen.roles.test.tsx`, `ClubScreen.test.tsx`): an Organizer of a Shared club sees the hint; going offline swaps it for the offline note; a Local club's Edit players has no hint.
- `pnpm test`, lint and the full `pnpm e2e` pass.
