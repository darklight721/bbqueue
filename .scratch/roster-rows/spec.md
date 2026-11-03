# Spec: Roster rows on the Club page

Status: ready-for-agent
Depends on: club-page, edit-players

Screens (changed): `/clubs/:clubId` (Club page: the Players list), `/sessions/:id` (Session page: its Players sort control moves to a shared component, no visible change).

Vocabulary per `GLOSSARY.md`: **Club player**, **Account**, **Organizer**, **Skill level**, **Ended session**, **Ended match**, **Win rate**, and the new **Last played**. The UI calls the Play record "Stats".

## Problem

A roster row on the Club page reads `[avatar] Name [You] … [INT] ›` with `ORGANIZER · 12 matches · 58%` under it. The avatar is only initials and takes room. The Win rate reads as a ranking, which the roster isn't for; it belongs on Stats. Nothing shows which Club players are Accounts. The Skill badge sits far right, while the Session page shows it right after the name. An Organizer can't see at a glance who still comes and who has dropped off.

## Roster row

- No avatar. The row starts with the name.
- Line 1: name, then the link icon (only on linked rows), then the compact Skill badge at the Session page's size (`SkillBadge compact size="sm"`, as in `PlayerChip`'s inline layout), then "You" on the viewer's own row, then the chevron at the far right. The name truncates; everything after it keeps its size.
- Link icon: `LinkIcon` (as on Edit players' linked rows), muted, on every Club player linked to an Account: Organizer rows and the viewer's own row too. Only Shared clubs have links, so a Local club never shows it. Shown to both Roles; it says an Account is linked, never which (Account IDs stay hidden).
- Line 2, muted, only when there's something to say: `ORGANIZER` on Organizer rows (Shared club), and `Last played Fri, 2 Oct` for a Club player with a Last played, joined by `·`. A Club player with neither gets a single line. No match count and no Win rate on the row.
- Date format: the Ended sessions list's day (`sessionDay`: "Fri, 2 Oct", device locale), with the year added when it isn't the current year ("Fri, 2 Oct 2025").
- The row's accessible description, in order: "You", "Organizer", "Linked to an account", "Last played Fri, 2 Oct", the Skill level label; only the parts that apply, joined by ", ".
- Everything else stays: the whole row opens that Club player's Stats; the viewer's own row keeps its tint and left stripe.

## Last played

As in `GLOSSARY.md`: the Start of the most recent Ended session of this Club in which the Club player played at least one Ended match (scored or not). Being a Session player without a Match doesn't count; the Active session doesn't count. Worked out over the Ended sessions this device can see (for a Shared club, the 50 most recent), so a Club player whose last play is older than those has no Last played and a single line.

## Sort

- A sort control between the Players heading (and its note) and the list, with two options: **Name** (A to Z, ignoring case, as today) and **Last played** (most recent first; ties by name; Club players with no Last played at the bottom, by name).
- It looks and behaves exactly like the Session page's Players sort ("SORT BY" and a pill group of radios, `PlayersSection.tsx`'s `SortControl`): move that control into `src/components/` as a generic component and use it on both pages, so they can't drift apart. The Session page's look and behaviour don't change.
- Shown only when at least one Club player on the roster has a Last played (otherwise Last played would sort exactly like Name). While it's hidden the list sorts by Name.
- Remembered device-wide, for every Club, under its own key `bq:v1:roster-sort` (not the Session page's `bq:v1:players-sort`; the options differ). Defaults to Name; a missing or invalid saved value is Name. While the control is hidden, a saved "Last played" is kept, not overwritten, and applies again once the control shows.
- The viewer's own row is not pinned to the top: it sorts like every other row.

## Domain

- `clubRosterFigures` (`src/domain/playRecord.ts`) gives, for every Club player of the Club with a Last played, that Last played (the Session's `startedAt`), in one pass over the Ended sessions. Match counts, wins, losses and Win rate leave `RosterFigures`; Stats keeps them through `clubPlayRecord`, unchanged.
- A pure roster sort (name, or Last played with the tie rules above), unit tested.
- No storage beyond the sort preference, no Backend or Security Rules change.

## Out of scope (later)

- The Edit players page (its rows are unchanged).
- The initials avatar on Stats' Partners list.
- Counting the Active session toward Last played, or a "Playing tonight" marker.
- More sort options, or pinning the viewer's own row.

## E2E workflows

On `chromium-mobile` and `webkit-mobile`, in `e2e/club-page.spec.ts`. Replace "rows of Club players who played show matches and Win rate; one who never played has one line".

1. A Shared club with an Organizer (linked), a linked Player and an unlinked Club player, and an Ended session: rows have no avatar and no Win rate or match count; the name and Skill badge are on one line; linked rows (Organizer and Player alike) show the link icon and the unlinked one doesn't; the Organizer row's second line reads `Organizer · Last played <day>`; a Club player who never played has one line. Checked through the accessible descriptions.
2. A Club whose roster has never played: no sort control. With an Ended session: the control shows, Name is selected, the list is A to Z; Last played puts the most recent first and never-played Club players last, by name.
3. Choose Last played → reload → still Last played, and another Club's roster opens sorted by Last played too.

The Session page's Players sort is already covered in `e2e/session-players.spec.ts`; it must still pass after the move.

## Acceptance

- The E2E workflows above pass, and the full `pnpm e2e` passes.
- Unit tests: Last played (most recent Start wins; a Session joined without a Match doesn't count; Guests-only Ended sessions and older Ended sessions without `clubPlayerId` add nothing; other Clubs' Ended sessions ignored); the roster sort (ties by name, never-played last); the date with and without the year; the sort preference (default, invalid value).
- Component tests for the row and the control's visibility updated in `ClubScreen.test.tsx` / `ClubScreen.shared.test.tsx`.
