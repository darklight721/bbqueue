# New session tweaks: skill badge, 2-column players, compact add form

Status: done

Follow-up to `.scratch/new-session/spec.md`. Vocabulary: `GLOSSARY.md` (see **Skill level**, **Club player**, **Guest**).

## 1. Skill badge (app-wide)

The old icon (three rising bars) read as a stamina/energy meter next to "N played". Replaced everywhere.

- **Compact badge** (player chips, Match rows, Court cards, Top winners, New session tiles): a fixed-width coloured tag showing **BEG / INT / ADV** in caps, small semibold text. All three are the same width so chips line up. The full label is the tooltip and the screen-reader text.
- **Full badge**: the same coloured tag with the full label (Beginner / Intermediate / Advanced) and no icon.
- Colours unchanged (`--color-skill-*`, Okabe–Ito based). The badge only needs to tell the three levels apart; it does not need to show which is higher.
- Abbreviations are a display concern only; the domain term stays **Beginner** (not Novice).

## 2. Club players: 2-column grid

- Club players are shown as tiles in a 2-column grid (3 columns at `sm` and wider). Each tile has a checkbox, the name and the compact badge under it.
- The whole tile toggles the player. A checked tile has a primary border and tint, plus the filled checkbox.
- Order is alphabetical, row by row (left to right, then down).
- Long names are cut off with "…"; the full name stays the checkbox's accessible name and the tile's tooltip.

## 3. Guests: same grid

- Added Guests use the same 2-column tile grid with the compact badge.
- Instead of a checkbox, each tile has a remove ✕ in the corner (at least a 44px tap target, accessible name unchanged).
- Status line under the badge (so badges stay level across tiles) when it applies:
  - Duplicate name → **"Name taken"** in red, and the tile gets a red border. Screen readers hear "Name already used by a Club player".
  - Save to club checked → **"Saves to club"** in faded text.

## 4. Add-player form (New session and the Session's Players section)

- Row 1: **Player name** and **Skill level** side by side.
- Row 2: **Save to club** checkbox on the left, **Add** button on the right.
- When Save to club is hidden (No club), Add stays right-aligned at the same size.
- On very narrow screens the Add button drops its ＋ icon so row 2 still fits; if it still doesn't fit, Add wraps to its own line on the right.
- Name error still shows under the name field. Enter in the name field still adds.

## Acceptance

- Existing accessible names and roles are unchanged ("Club players" region, checkboxes named after players, "Skill level" select, "Save to club" checkbox, Add / remove buttons).
- Works at 320px wide in light and dark mode, on both the New session page and the Session's Players section.
- `pnpm check`, `pnpm test` and the e2e suite pass.
