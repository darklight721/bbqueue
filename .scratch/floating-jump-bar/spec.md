# Spec: The section jump bar floats at the bottom on every screen size

Status: resolved (implemented 2026-10-31)

Vocabulary per `GLOSSARY.md`.

## Problem

- On phones the section jump bar (`SectionJumpBar.tsx`, `<nav aria-label="Sections">`: Courts · Queues · Players · History) is a full-width strip glued to the bottom edge, with a top border. Modern iOS apps float their bottom bars as a capsule instead.
- From `sm` up it is a different bar again (sticky under the top bar), so it has two sets of styling and two scroll offsets.

## Decisions

### 1. It stays a jump bar

Same behaviour: one long Active session page, buttons scroll to a section (opening a collapsed one first), `aria-current` follows the section in the upper band of the screen. Not tabs, no separate views.

### 2. Shape and position

- A capsule (`rounded-full`) that hugs its four buttons, centred horizontally.
- Floats at the bottom, dipping about 8px into the bottom safe area so it sits just above the home indicator, like native iOS bottom bars (at least 12px above the edge on screens without one).
- Never wider than the screen minus the 16px side gutters; below 360px the buttons' side padding shrinks so all four still fit on a 320px phone.
- Buttons stay 44px tall.

### 3. Every screen size

- The same floating capsule on phones, tablets and desktops.
- The `sm:` sticky-under-the-top-bar variant goes away.
- `SECTION_SCROLL_MARGIN` then only has to clear the top bar on every size.

### 4. Material

- Same as the top bar (`TopBar.tsx`): `bg-base-100/95 backdrop-blur supports-[backdrop-filter]:bg-base-100/85`, `border-base-300` hairline (all round).
- Plus a soft, low-opacity all-round shadow so it reads as floating. That is the only difference from the top bar.

### 5. Current-section indicator slides

- One indicator pill (secondary colour, as today) sits behind the current button and slides to the new one when the current section changes.
- No slide under `prefers-reduced-motion`: it moves at once.

### 6. Always shown

- No shrinking or hiding on scroll.
- Still hides while a text field has focus, now on **every** screen size (not only phones).

### 7. What depends on its height

- `JUMP_BAR_BOTTOM_SPACE` (end-of-page spacer) and `NOTICE_BOTTOM` (pop-up messages) are recalculated from the floating height plus its gap above the bottom edge, on every size (no `sm:` split).

## Out of scope

- The sticky footer in `Screen.tsx` (other screens' primary actions) is unchanged.
- No icons on the buttons; labels unchanged.
- No glossary change: the jump bar is screen layout, not a domain term.

## E2E workflows

`e2e/session-players.spec.ts`, "Section jump bar" (replace the "touches the bottom edge" and "sticks under the top bar on wider screens" tests):

- On a phone and on a 1024px screen: the bar floats at the bottom, with a visible gap between its bottom and the viewport's bottom edge, and is narrower than the viewport.
- On a phone and on a 1024px screen: jumping to Players lands its heading clear of both the top bar and the floating bar; `aria-current` moves to Players.
- Scrolled to the bottom, the bar never covers End session.
- Pop-up messages sit above the bar.
- Jumping from Courts to History moves the pill straight to History: `aria-current` never passes through the sections scrolled past.
- On a 1024px screen, focusing a text field (Add player name) hides the bar; blurring it brings it back.

`e2e/session-history-end.spec.ts`, "Jump bar": update its "not hidden under the jump bar" check if it assumes the top position on wider screens.

The sliding animation itself is visual and not tested beyond `aria-current`.
