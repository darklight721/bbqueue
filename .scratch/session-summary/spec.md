# Spec: Session summary screen

Status: ready-for-agent
Depends on: session

Route: `/session/summary` (no saved SessionSummary → redirect `/`)

## Content

- Title: Session name, "Session summary".
- **Total matches played** (Ended matches).
- **Total players** (Session players who played ≥ 1 Ended match).
- **Total duration** (start → End session), formatted "2 h 15 min" / "45 min".
- **Top 3 by wins**: place, name, Skill badge, wins, matches played. Shared places (1, 1, 3); everyone with place ≤ 3 shown. If nobody has a win: "No scored matches".
- **Home** link → `/` (clears the saved summary).

## Behaviour

- The summary is persisted (`bq:v1:summary`) so a reload keeps it; cleared when the user goes Home or starts a new Session.

## Acceptance (e2e)

- After playing and scoring a few matches then End session: totals and top winners correct (ties shown with shared place).
- Reload keeps the summary; Home clears it (direct visit to `/session/summary` then redirects Home).
- No scored matches → "No scored matches".
