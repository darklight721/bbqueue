# Spec: Play record (Stats)

Status: done
Depends on: ended-sessions, ended-session-standings, accounts, shared-clubs

Screens (new): `/clubs/:clubId/players/:clubPlayerId/stats` (Club view) and `/account/stats` (Account view).
Screens (changed): `/sessions/:id` (`src/features/past-sessions/EndedSessionScreen.tsx`, Standings rows) and `/account` (`src/features/account/AccountSettingsScreen.tsx`).

Vocabulary: **Play record**, **Win rate** (GLOSSARY.md). The UI calls the page "Stats".

## Storage

- An Ended session player also saves `clubPlayerId: string | null`: the Club player the Session player was copied from. It is `null` for Guests who weren't saved to the Club and for every player in a Session with no Club.
- This applies to Sessions ended **from now on**. Older Ended sessions, both on the device and on the server, don't have the field. Reading them must still work, and treats it as `null`. Nothing is filled in after the fact.
- The Account ID is **not** saved. A Club player's Account is looked up from the Club's roster when needed.
- No Security Rules change: the field travels inside `endedJson`, whose contents the rules don't check.
- Update ADR-0005's list of what the slimmed copy keeps.

## Domain

- **Club view** of a Club player: every Ended session of that Club that this device can see (`useEndedSessions()`), and in each one the Session player whose `clubPlayerId` matches.
- **Account view**: every Club player row currently linked to the signed-in Account, in every Club this device knows. It combines those rows' Club views. If a row is later relinked to another Account, its history moves with the row (accepted, since a row stands for one person in its Club).
- The figures come from Ended matches only:
  - **Matches played**, **Wins**, **Losses**, **Sessions played** (Ended sessions with at least one Ended match for this person).
  - **Win rate** = wins ÷ (wins + losses). Matches without a Score count as played only. With no wins and no losses there is no Win rate (shown as "–"), not 0%.
  - **Per Session**: date, Club name (as at Start), wins and losses, matches played, the Session's Win rate (if any), and place in that Session's Standings (`rankStandings`).
  - **Partners**: identified by Club player row. Guest Partners (`clubPlayerId: null`) are left out. *Most frequent Partner* is the one with the most Ended matches together. *Best Partner* is the highest Win rate together, among those with **at least 3** matches together where at least one was scored. Ties are broken by more matches together, then by name. If none qualify, the section says so.
- The name shown is the Club player's current roster name. If they've been taken off the roster, use the name from their most recent Ended session.
- Pure functions in `src/domain/` with unit tests. No React.

## Club view `/clubs/:clubId/players/:clubPlayerId/stats`

Sections in this order:
1. **Header**: the person's name and the Club name.
2. **Headline numbers**: Matches, Wins, Losses, Win rate, Sessions (the labels are kept short so each fits on one line).
3. **Chart**: a line chart of Win rate per Session over the **last 20** Sessions, oldest on the left.
   - Each Session is a dot. A Session with no win or loss is a gap that breaks the line, not 0%.
   - A dashed horizontal line marks the overall Win rate.
   - Tapping a dot scrolls to that Session's row in the list. Each dot has a label (date, wins and losses) so the number of matches behind it is clear.
   - Hand-written SVG coloured with daisyUI theme colours. No chart library.
4. **Partners**: Most frequent and Best Partner.
5. **Session list**: every Session, newest first. Each row shows the date, wins and losses, and place, and links to `/sessions/:id`.
- A note says that only Sessions ended after this feature shipped count.
- Anyone who can open the Ended session can open the view. No extra permission check.
- If nothing matches (an unknown Club player or no Ended sessions), show a plain empty state and keep the Back button.

## Account view `/account/stats`

- The same layout as the Club view. The header shows the Account's name.
- Session rows and Partners show their Club name when the view spans more than one Club.
- If no Club player row is linked to the Account, explain that stats appear once an Organizer links you to a Club, and show nothing else.
- Without an Account, the route sends you back to `/account`.

## Entry points

- **Ended session Standings**: each row whose Session player has a `clubPlayerId` links to its Club view. Guests not saved to the Club, and players in older Ended sessions without the field, stay plain text. `StandingsEntry` needs the Session player's id or `clubPlayerId` for this.
- **Account page**: a "Your stats" row in the Account panel, under the Account ID, opening `/account/stats`.
- **Back**: returns to wherever the page was opened from; the origin lives in the URL (as for Ended sessions), so it survives a reload. A bare URL (deep link) goes Back to `/clubs/:clubId/sessions` for the Club view; the Account view always goes Back to `/account`. An Ended session opened from a Stats Session row goes Back to that Stats page.

## Out of scope (later)

Win run (consecutive wins; not "Streak"), opponents, points scored and conceded, recent results, links from Club roster rows, merging Partners across Clubs by Account, a Club filter in the Account view.

## E2E workflows

On `chromium-mobile` and `webkit-mobile` unless marked otherwise. One spec file: `e2e/play-record.spec.ts`.

1. Ended session → tap a Standings name → the Club view shows that Club's figures → Back returns to the Ended session.
2. A Guest who wasn't saved to the Club is not a link in the Standings.
3. Account page → Your stats → the Account view combines two Clubs → Back returns to the Account page.
4. Opening a Club view by bare URL and reloading keeps its content. Back then goes to the Club's Past sessions.
5. Tapping a Session row opens that Ended session.
6. Emulator (`e2e/emulator/play-record.spec.ts`): a Player (the Role) on another device opens the Club view from a Shared club's Ended session.

## Acceptance

- Unit tests for the domain: Win rate leaves out matches without a Score and gives "none" when there are no wins or losses; the Club view filters by `clubPlayerId` within the Club; the Account view combines the currently linked rows; Best Partner needs at least 3 matches together and ignores Guests; places come from `rankStandings`; old Ended sessions without `clubPlayerId` are read without errors and add nothing.
- Unit test: an Ended session made from a Session keeps `clubPlayerId`, and it survives saving and reading back on the device and through the server copy.
- The E2E workflows above pass, and the full `pnpm e2e` passes.
