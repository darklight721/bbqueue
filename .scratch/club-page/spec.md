# Spec: Club page

Status: done
Depends on: club-edit, play-record, shared-clubs

Screens (changed): `/clubs/:clubId` (`src/features/club-edit/ClubEditScreen.tsx` and `ClubReadOnly.tsx` become one Club page), `/clubs` (`src/features/clubs/ClubsScreen.tsx`, New club sheet), `/clubs/:clubId/players/:clubPlayerId/stats` (Back to the Club page).
Screens (removed): `/clubs/new` (redirects to `/clubs`).

Vocabulary: **Club**, **Club player**, **Organizer**, **Player** (the Role), **Play record** and **Win rate** (GLOSSARY.md). The UI calls the Play record "Stats". The people on the roster are Club players, never "members".

## Why

The Edit club screen is one big form: every roster row is a name field, a Skill level select and a ✕, and one Save covers the Club name and the whole roster. A row can't be tapped to open that Club player's Stats, and the screen isn't a page about the Club. It becomes the Club's page: a court-green card like the Account page and Stats, a roster you can tap, and editing split into two parts that each save on their own (the Club name, and the roster).

## Club page `/clubs/:clubId`

One page for everyone who can see the Club. Organizers of a Shared club, and whoever holds the device for a Local club, get the Edit buttons; a Player (the Role) gets the same page without them. `ClubReadOnly` goes away. Unknown ids still redirect to `/clubs`.

Top bar: Back to `/clubs`, title "Club".

Sections in this order:

1. **Club card**: the court-green card used on the Account page and Stats (`bg-court`, glow, court lines, off-white text).
   - Pill: "Club".
   - The Club name, large and uppercase.
   - One line under it: "Shared club · You're an Organizer" / "Shared club · You're a Player" for a Shared club; "This device only" for a Local club when the app has a Backend; nothing otherwise.
   - No number tiles under the card.
   - **Edit** (pencil, top right of the card, only for those who may change the Club): turns the name into a field with **Save** and **Cancel**, as on the Account page (`NameSection`). Save renames the Club and nothing else; Escape or Cancel goes back without saving. The same name checks as today (required, at most 40 characters, unique among this device's Clubs ignoring case, its own name in a different case allowed). Errors show on the card as on the Account page. A rename that fails on the server keeps the field open with the error.
2. **Session cards**: unchanged: Open active session or New session, and Sessions (past sessions), side by side.
3. **Players**: heading "Players" with the count, and **Edit** (only for those who may change the roster).
   - With no Club players: the empty note, pointing at Edit (or, for a Player, just "No players yet").
   - Otherwise a plain list in one card, rows ruled off, sorted by name.
   - Each row: avatar, name, an Organizer badge on Organizer rows (Shared club), "You" on the viewer's own row (as `ClubReadOnly` does today), the Skill badge, and a chevron. The whole row links to that Club player's Stats.
   - A second, muted line under the name, only for Club players with at least one Ended match: "12 matches · 58%". With no win or loss yet: "3 matches". Figures are the Club view's (`clubPlayRecord`), over the Ended sessions this device can see. Club players who never played get a single line. This line must not make long rosters look crowded; if it does in practice, drop it rather than squeeze more in.
   - Account IDs are not shown on the list.
4. **Make shared**: unchanged (Local club, with a Backend).
5. **Danger zone**: unchanged (Leave club, Delete club, with today's rules).

### Players Edit mode

- **Edit** on the Players heading turns the list into today's roster form: one row per Club player with the shared player editor (name, Skill level, ✕), Account linking by `@Account ID`, Roles, Unlink, the last-Organizer rules, Enter-to-next-row, and validation as they are today.
- The heading's Edit becomes **Cancel**: leaves Edit mode and throws away unsaved roster changes (no confirm).
- The footer pins **Add player** and **Save**, as today. Save validates as today; on success it stays on the Club page and leaves Edit mode (today it went back to `/clubs`). A failure keeps Edit mode with the message, as today.
- While in Edit mode: the card's Edit, Make shared and the Danger zone are hidden; the session cards stay and still ask "Discard changes?" first when there are unsaved changes; rows don't link to Stats.
- Back (or any link off the page) with unsaved roster changes asks "Discard changes?", as today. Outside Edit mode nothing ever asks.
- A Shared club changing under an open Edit mode behaves as today: follow it while nothing is unsaved, keep this person's changes otherwise, and Save sends only what they changed.
- Offline rules unchanged: adding rows to a Shared club, linking Accounts and changing Roles need a connection.
- No confirm before removing a Club player: ✕ only changes the unsaved form, and Cancel undoes it.

## New club sheet (on `/clubs`)

- The Clubs page's **Add club** button opens a bottom sheet (`Modal`) titled "New club" with one field, **Club name**, and **Create club**. A ✕ (or Escape, or the backdrop) closes it without creating anything.
- The name gets the same checks as today, shown under the field.
- Create club makes the Club as today (a Shared club while signed in, starting with the creator's own row linked as Organizer; a Local club otherwise), closes the sheet, and opens the new Club page **in Players Edit mode** with an empty row focused (on a new Shared club, after the creator's row).
- The Clubs page's empty state uses the same sheet.
- A failure keeps the sheet open with the message (e.g. offline for a Shared club).
- `/clubs/new` is removed; an old link redirects to `/clubs` (replace).

Linking other Accounts now happens in Players Edit mode after Create, in a second save. That was the rejected option in ADR-0008; its reasons no longer hold (Edit mode opens straight away, and there is one roster editor, not two). Append a dated note to ADR-0008 saying so. The Security Rules that allow links in the creating batch stay: harmless, and still used for the creator's own row.

## Stats from the roster

- A roster row opens `/clubs/:clubId/players/:clubPlayerId/stats` with an origin in the URL marking that it came from the Club page (a new query param next to `FROM_SESSION_PARAM` in `statsOrigin.ts`).
- Back from Stats opened this way returns to `/clubs/:clubId`. The origin survives a reload. Bare Stats URLs keep today's Back (`/clubs/:clubId/sessions`).
- The chain holds: Club page → Stats → a Session row → Ended session → Back → Stats → Back → Club page.
- Stats itself is unchanged; there is no editing on it.

## Domain

- One pure function that gives, for every Club player of a Club, their Ended matches played and Win rate in one pass over the Ended sessions (built on the Play record code, not a second set of rules). Unit tested: Club players with no Ended match, a Win rate of "none" with only unscored matches, older Ended sessions without `clubPlayerId` adding nothing.
- No storage, Backend or Security Rules change. Renaming a Shared club already goes out as its own change (`rename` in `clubChanges.ts`).

## Out of scope (later)

Search or sort on the roster, "last played" on rows, pasting several names at once, tiles on the Club card, editing a Club player from their Stats page.

## E2E workflows

On `chromium-mobile` and `webkit-mobile` unless marked otherwise. Rework `e2e/club-edit.spec.ts` into `e2e/club-page.spec.ts` (the screen is now the Club page); move the New club tests to `e2e/clubs.spec.ts`. Every test that opens `/clubs/new` moves to the sheet. Update `e2e/club-roles.spec.ts`, `e2e/shared-clubs.spec.ts`, `e2e/make-shared-club.spec.ts` and the emulator specs wherever they edit a roster: they now tap Edit on Players first, and Save stays on the Club page.

1. Clubs → Add club → sheet → type a name → Create club → the Club page opens in Players Edit mode with an empty, focused row → add 3 players of different Skill levels → Save → still on the Club page, out of Edit mode, rows sorted → Back → the Clubs list shows "3 players".
2. The sheet: an empty, too long or duplicate name blocks Create with a message; ✕ closes it and nothing is created.
3. `/clubs/new` redirects to `/clubs`.
4. Club card: Edit → change the name → Save → the card shows the new name, also after a reload; Edit → Cancel keeps the old name; a duplicate name shows an error on the card.
5. Players Edit mode: rename, change Skill level, remove one, add one → Save → the list reflects it after a reload. Edit → change something → Cancel → nothing changed.
6. Players Edit mode with unsaved changes → Back asks "Discard changes?"; Keep editing stays, Discard leaves without saving. Outside Edit mode Back leaves straight away.
7. Validation in Edit mode: an empty or duplicate player name blocks Save with a message.
8. Tap a roster row → that Club player's Stats → Back returns to the Club page; reloading Stats first keeps Back on the Club page.
9. A Club player with Ended matches shows "N matches · W%" on their row; one who never played shows no second line.
10. A Player (the Role) sees the Club card without Edit, no Edit on Players, and can open a Club player's Stats from the roster.
11. Delete club and the session cards behave as today (moved over from `club-edit.spec.ts`).
12. Emulator (`e2e/emulator/roles.spec.ts` or `shared-clubs.spec.ts`): an Organizer renames a Shared club from the card on one device and the other device's Club page shows the new name.

## Acceptance

- The E2E workflows above pass, and the full `pnpm e2e` passes.
- Unit tests for the roster figures function, and component tests updated for the merged Club page (Edit buttons only for Organizers and Local clubs, Edit mode hiding the card's Edit, Make shared and Danger zone).
- `ClubReadOnly.tsx` is gone; `/clubs/new` is gone from `App.tsx`.
- ADR-0008 has its note.
