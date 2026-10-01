# Session screen tweaks

Status: done

Follow-up to `.scratch/session/spec.md`. Vocabulary: `GLOSSARY.md` (see **Point system**, **Target**, **Fairness window**). Decision: `docs/adr/0004-match-keeps-its-target.md`.

## 1. Jump bar

- Phones (`< sm`, < 640px): the jump bar is fixed to the **bottom** of the viewport, above `env(safe-area-inset-bottom)`. Page content gets enough bottom padding that End session is never hidden behind it.
- `sm` and wider: unchanged (sticky under the top bar).
- Section scroll offsets must suit each placement (on phones only the top bar needs clearing).
- Jumping to a **collapsed** section (Players, History) opens it, then scrolls to it.

## 2. Players section

- Collapsible, **open by default**. Collapsed = only the header (title + summary) is visible; Add player form and the list are hidden. Same toggle pattern as History.
- Open/closed state (Players and History) is not persisted; resets on each visit.
- History stays closed by default (already true).
- **Sort** control with three options, no direction toggle:
  - **Name**: A→Z (case/accent-insensitive). Default.
  - **Plays**: fewest `matchesPlayed` (Ended matches only — the number shown on the row) first, then name.
  - **Status**: On court (by court number) → In lineup (by court number) → Free → Sitting out, then name.
- Last chosen sort is remembered on the device (localStorage).
- **Sit out / Back in** button: smaller inline padding, no `min-w-[6.5rem]`, fixed width that fits the longer label ("Back in") so the row doesn't shift. The ✕ Remove button is unchanged.

## 3. Remove court

- Replaces the bottom "Remove court" row with a **trash icon** button at the top-right of the court card header.
- Shown only on **Idle** courts; **hidden** on Busy courts (the "End or remove the match first" hint is removed).
- No confirmation (same as today). Accessible label "Remove court N".

## 4. Point system during a Session

Domain:
- Each Match stores its **Target** (21 | 31) = the Session's Point system when the Match started.
- Saved Sessions without a Match Target: treat Target as the Session's Point system (load-time migration / fallback).
- Ending a Match validates its Score against **the Match's Target**, not the Session's Point system.
- New operation to change the Session's Point system (21 | 31). It affects only Matches started afterwards. Fairness window keeps following the Session's current Point system (immediately).
- Suggestion based on **time left**: `suggestPointSystem` with `hours = plannedHours − elapsed`, current non-removed players and current courts. No suggestion once time left ≤ 0 (or under 4 players).

UI:
- Tapping the top-bar "N pts" badge opens a dialog: 21 / 31 toggle; if any courts are playing, a line "Matches being played stay at N."; the time-left suggestion (e.g. "Suggested: 21 — about 2 more games each"). No extra confirm; change applies on selection/save.
- Busy court card: a "to N" tag only when that Match's Target ≠ Session's current Point system.
- Score dialog uses the Match's Target ("Winner needs at least N").
- History entries show the Target only if the Session's Ended matches include both 21 and 31.
- End-of-session summary: unchanged.
