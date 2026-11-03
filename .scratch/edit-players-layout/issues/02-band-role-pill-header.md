# 02 Edit players: Account ID band, Unlink icon, Role pill and column header

Status: done
Spec: ../spec.md

## What

- `src/features/club-edit/AccountLinkSection.tsx` (`LinkedLine`): move the chip's tint (`bg-base-200` / `bg-primary/10` for You / `bg-error/10` when gone) onto the whole Account ID line, so one rounded band spans the Account ID, the Role column and the Remove column. The band is one line, `h-10`: the Account ID, the Role, then Unlink, or "You" (`text-xs font-semibold text-primary`) in that column on the viewer's own row, so the Account ID keeps the room. Keep the Account ID's text in line with the name field's text and the Role in `ROW_SELECT_COLUMN`. Helper lines stay below the band, untinted.
- Same file: Unlink becomes an icon button in the Remove column inside the band (`btn btn-ghost btn-square`, `w-12 h-10`, `text-base-content/70`, red on hover, red all the time when the Account no longer exists), aria-label still "Unlink <name>". Same states as now: absent on your own row ("You" there instead), undo for an unsaved link (offline too), disabled for a saved link offline, no confirm.
- `src/components/icons.tsx`: a new `UnlinkIcon` (link-slash: `LinkIcon`'s chain with a diagonal stroke), same props and stroke style as its neighbours.
- Same file: replace `RoleSelect` with a two-option pill (`radiogroup` "Role for <name>", radios "Player" / "Organizer"), modelled on the Skill level picker in `src/features/session/players/PlayerMenuSheet.tsx`: rounded-full track, chosen radio `btn-primary`, `has-[:focus-visible]` ring, `h-10`, `text-[0.8125rem]`, each side `flex-auto` from its label's width. The track contrasts with the band (e.g. `bg-base-100`). Disabled when offline; absent when the Account no longer exists. `onRole` and the refusal on the only Organizer are unchanged. "Organizer" fits without truncating at 320px.
- `src/features/club-edit/EditPlayersScreen.tsx`: when the roster has rows, an `aria-hidden` header line above the `ul`: "Name" and "Skill level", with a blank `ROW_ACTION_COLUMN`, so they line up with the columns. Legend style `text-xs font-bold tracking-[0.14em] uppercase text-base-content/60`. Under the hint / offline note. Not sticky. No Role heading.
- Component tests (`ClubScreen.roles.test.tsx` and friends): move from `combobox` to `radiogroup`/`radio`; the header shows with rows and not on an empty roster.

## E2E workflows

The existing Role workflows, now through the pill: switch `combobox "Role for …"` to `radiogroup "Role for …"` with radios in `club-roles.spec.ts`, `make-shared-club.spec.ts`, `emulator/roles.spec.ts`, `emulator/make-shared-club.spec.ts`, `emulator/shared-clubs.spec.ts`, `emulator/delete-account.spec.ts`. `club-roles.spec.ts` covers choosing a Role by tap (both browsers) and the refusal on the only Organizer. Unlink keeps its accessible name, so its existing workflows in `club-roles.spec.ts` cover the icon button and must still pass. Band and header are visual only (exempt). Full `pnpm e2e` passes, emulator projects included.

## Out of scope (later)

- The Club page's roster.
- A Role column heading, a sticky header, tinting the name line of linked players.
