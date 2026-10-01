# Spec: New session screen

Status: ready-for-agent
Depends on: foundation, club-edit (shared player component)

Route: `/session/new`

## Content

- Top bar: Back (→ `/`), title "New session".
- **Session name** field, default = today's date in the device locale, long-ish form (e.g. "Thu 1 Oct 2026" via `Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })`).
- **Club** select: all Clubs alphabetically + "No club (guests only)".
  - Exactly one Club exists → that Club pre-selected.
  - No Clubs exist → "No club (guests only)" pre-selected.
  - Several Clubs → nothing pre-selected (placeholder "Choose a club").
- When a Club is selected: its Club players listed alphabetically with checkboxes (all **unchecked** by default) + a "Select all / none" control, each showing name + Skill level.
- **Guests**: shared add-player form (name + Skill level). "Save to club" checkbox (unchecked by default) shown only when a Club is selected. Added Guests listed below with a remove button and their Skill level.
- **Courts**: number input with −/+ buttons, default 1, range 1–10.
- **Hours**: number input with −/+ buttons, default 1, step 0.5, range 0.5–12.
- **Point system**: toggle 21 / 31, pre-set to the suggestion, with a one-line reason (e.g. "Suggested: 31 — about 4 games each"). Changing players/courts/hours updates the suggestion and resets the toggle to it **unless the user has manually changed the toggle**.
- **Start session** button.

## Point-system suggestion

```
playersCount = selected Club players + Guests
gamesEach(matchMinutes) = courts * hours * 60 / matchMinutes * 4 / playersCount
suggest 31 if gamesEach(30) >= 3, else 21
```
Reason line shows `round(gamesEach(chosenMatchMinutes))` games each. Hidden until ≥ 4 players.
Pure function, unit-tested.

## Behaviour

- Start enabled when: name non-empty, ≥ 4 players total, courts in range, hours in range.
- Changing the Club clears checked players (Guests are kept; their "save to club" flags cleared if switched to No club).
- Guest names must be unique among selected players + Guests (case-insensitive).
- Start:
  1. If a saved Session exists → confirm "End the current session '<name>'? It will be discarded." Cancel → stay.
  2. Guests with "Save to club" checked are added to the Club (skip if name already in Club — validation prevents this anyway).
  3. Create Session: snapshot players (ADR-0002), Courts numbered 1..n, initial Lineups computed by the engine, save, navigate to `/session`.
- Any existing SessionSummary is cleared on Start.

## Acceptance

- Unit: suggestion function (boundaries around 3 games each).
- E2E:
  - One Club → auto-selected; players listed; select 4, Start → lands on Session with the right name/courts.
  - No Clubs → guests-only pre-selected; add 4 Guests → Start works; no "save to club" checkbox.
  - Guest with "Save to club" checked is in the Club afterwards; unchecked is not.
  - −/+ buttons respect bounds; suggestion text updates when courts/hours/players change.
  - Start disabled with < 4 players.
  - Existing saved Session → confirm shown; cancel keeps old Session.
