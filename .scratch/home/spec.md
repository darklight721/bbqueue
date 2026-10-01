# Spec: Home screen

Status: done
Depends on: foundation

Route: `/`

## Content

- App title "Badminton Queue".
- **New session** → `/session/new`.
- **Resume session** → `/session`. Shown **only** when a saved Session exists. Shows the Session name as secondary text.
- **Clubs** → `/clubs`.

## Behaviour

- If a saved Session exists and the user taps **New session**, navigate to `/session/new` as normal; the confirm to discard the existing Session happens when starting the new one (see new-session spec). *(Alternative considered: confirm on Home. Rejected: user may only want to look.)*
- Visiting Home clears a saved SessionSummary (summary is kept only until the user leaves it — see session-summary spec).

## Acceptance (e2e)

- Fresh storage: New session and Clubs visible; Resume session hidden.
- With a saved Session in storage: Resume session visible with its name; tapping it opens `/session`.
- Each link navigates to the right route; browser Back returns to Home.
