# Spec: Edit players on its own page

Status: ready-for-agent
Depends on: club-page (Players Edit mode), name-sheet

Screens (new): `/clubs/:clubId/players` (Edit players).
Screens (changed): `/clubs/:clubId` (Club page: Players Edit mode goes away), `/clubs` (New club sheet: where Create club lands).

Vocabulary per `GLOSSARY.md`: **Club**, **Club player**, **Organizer**, **Player** (the Role). No glossary change: this is navigation, not domain.

## Problem

- Players Edit mode turns the Club page into a form in place. While it is on, the page blocks or guards everything else: the card's Edit, Make shared and the Danger zone are hidden, the session cards ask "Discard changes?" first (`leaveVia`), and rows stop linking to Stats. The Club page is a page you can't use while editing, so the editor might as well be its own page.
- Create club opens Edit mode through `?new=1`, which the page strips from the URL on open.

## Decisions

### 1. Route and title

- `/clubs/:clubId/players`, top bar title "Edit players", subtitle "<Club name> · N players" (N follows the unsaved rows, with "1 player" for one).
- No clash with `/clubs/:clubId/players/:clubPlayerId/stats`.

### 2. What's on the page

- Only the roster form, as Players Edit mode has it today: one row per Club player with the shared player editor (name, Skill level, ✕), `@Account ID` linking, Roles, Unlink, the last-Organizer rules, Enter-to-next-row, validation, the offline notes and rules, and following a Shared club that changes underneath while nothing is unsaved.
- The footer pins **Add player** and **Save**, with the one-line message above them, as today.
- No Club card, no session cards, no Players heading button. `leaveVia` and the session cards' discard guard go away.

### 3. Getting there

- On the Club page, **Edit** on the Players heading becomes a link to `/clubs/:clubId/players` (push). It is shown only to those who may change the roster (`canEditClub`), as today.
- The Club page has no Edit mode any more: Make shared, the Danger zone, the card's Edit and roster rows linking to Stats are always there for whoever may use them.

### 4. Leaving

- There is no Cancel button: Back is the cancel. Back with unsaved changes asks "Discard changes?" (Keep editing / Discard), as today; without changes it leaves straight away.
- Back and a successful Save both go to the Club page with **replace**, so Back from the Club page goes to Clubs, not into the editor again. (`TopBar` needs a way to replace instead of push.)
- After either, focus lands on the Players heading's Edit on the Club page.
- Save with nothing changed goes back without contacting the server.
- A successful Save announces "Players saved" to screen readers on the Club page (live region, as "Club renamed"). Nothing visible changes beyond the roster.
- A Save that fails stays on Edit players with the message, as today.
- Known gap, unchanged from today and New session: the system back gesture (iOS swipe-back, Android back) is not guarded and drops unsaved changes.

### 5. After Create club

- Create club (New club sheet) opens the new Club page and then pushes Edit players on top, with an empty row focused (on a new Shared club, after the creator's own row). Back or Save lands on the new Club page; Back from there goes to Clubs.
- The `?new=1` param (`JUST_CREATED_PARAM`, `newClubPath`) goes away. An old link with it just opens the Club page.
- How the blank row reaches Edit players (router state, a one-shot param stripped on open, …) is up to the implementation; a reload of Edit players must not add another blank row.

### 6. Who can open it

- An unknown Club id redirects to `/clubs` (replace), as the Club page does.
- Someone who may not change the roster (a Player, the Role) is redirected to the Club page (replace).
- An Organizer made a Player while the page is open is redirected to the Club page the same way (today: Edit mode ends).
- A Club deleted, or left, while the page is open redirects to `/clubs`.

### 7. Reload

- A reload stays on Edit players and loses unsaved changes, as today. No draft is kept.

## Out of scope (later)

- Guarding the system back gesture.
- Keeping a draft across reloads.
- Any change to the editor rows themselves (layout, confirm on remove, pasting several names).

## E2E workflows

On `chromium-mobile` and `webkit-mobile` unless marked otherwise. Move the Edit-mode tests out of `e2e/club-page.spec.ts` into a new `e2e/club-players.spec.ts`. Add a helper to `e2e/club-helpers.ts` that opens Edit players from the Club page, and switch every spec that edits a roster to it (`club-roles`, `shared-clubs`, `make-shared-club`, the emulator specs): they no longer expect Save to stay on the same URL.

`e2e/club-players.spec.ts`:

1. Club page → Edit → `/clubs/:clubId/players`, titled "Edit players" with the Club name → rename one, change a Skill level, remove one, add one → Save → back on the Club page, the list reflects it, also after a reload → browser Back goes to Clubs, not into the editor.
2. Back with no changes leaves straight away; with changes it asks, Keep editing stays with the edits, Discard returns to the Club page without saving.
3. Save with no changes returns to the Club page.
4. Enter in a player name moves to the next row, or appends one from the last.
5. An empty or duplicate (case-insensitive) player name blocks Save with a message.
6. A reload of Edit players keeps you there, with the saved roster.
7. A Player (the Role) opening `/clubs/:clubId/players` lands on the Club page; an unknown Club id lands on `/clubs`.

`e2e/club-page.spec.ts`:

8. Players heading's Edit opens Edit players. Drop the Edit-mode tests that move to `club-players.spec.ts`, and "in Edit mode rows don't open Stats" and "in Edit mode with unsaved changes, a session card asks first", which no longer apply.

`e2e/clubs.spec.ts`:

9. Add club → Create club → Edit players opens with an empty, focused row → add 3 players → Save → the new Club page lists them → Back → the Clubs list shows "3 players".
10. Create club → Edit players → Back (nothing typed) → the new Club page → Back → Clubs.

Emulator (`e2e/emulator/shared-clubs.spec.ts` or `roles.spec.ts`):

11. An Organizer is open on Edit players when another Organizer makes them a Player → they land on the Club page.

## Acceptance

- The E2E workflows above pass, and the full `pnpm e2e` passes.
- Component tests updated: the Club page has no Edit mode; Edit players covers what the Edit-mode tests covered, plus the redirects.
- `JUST_CREATED_PARAM`, `newClubPath` and `leaveVia` are gone.
