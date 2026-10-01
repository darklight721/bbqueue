# Spec: Clubs screen

Status: ready-for-agent
Depends on: foundation

Route: `/clubs`

## Content

- Top bar: Back (→ `/`), title "Clubs".
- **Add club** button → `/clubs/new`.
- List of Clubs, sorted alphabetically (case-insensitive). Each row: Club name + total player count ("12 players", "1 player"). The **whole row** is a link to `/clubs/:clubId`.
- Empty state: "No clubs yet" with the Add club action.

## Acceptance (e2e)

- Empty state shown with no Clubs.
- With Clubs seeded: rows sorted alphabetically, counts correct and pluralised.
- Tapping a row opens its edit screen; Add club opens `/clubs/new`; Back goes Home.
