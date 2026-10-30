# Spec: Spare players warning as an icon; Rehash all moves into the Rehash sheet

Status: resolved (implemented 2026-10-30)
Depends on: small-free-pool (Spare players note, Rehash blocked sheet)

Vocabulary per `GLOSSARY.md`.

## Problem

- The Spare players note (`SparePlayersNote.tsx`) is a full-width card under the Courts header. On a phone it pushes the Courts down.
- The header's "Rehash all" button takes the slot where a small warning icon could go. Rehash all is already offered in the Rehash blocked sheet, but only when Rehash is blocked.

## Decisions

### 1. Spare players warning becomes an icon with a popover

- The Courts header's action slot shows a warning icon button while `spareNotice(session)` is not null. Otherwise the slot is empty.
- The button is labelled "Few spare players" and announces whether the popover is open (`aria-expanded`).
- Tapping the icon opens a small popover under it with `spareNoticeText(notice)` (text unchanged). Tapping the icon again, tapping outside or pressing Escape closes it. It is a tap popover, not a hover tooltip (touch first).
- The icon rises in again each time the notice key (players/Courts count) changes. The popover never opens by itself.
- No ✕ and no saved dismissal: remove `setSpareNoticeDismissed`, `useSpareNoticeDismissed` and the `bq:v1:spare-notice-dismissed:<sessionId>` key.
- People who can only view the Session (`readOnly`) never see the icon.

### 2. The header "Rehash all" button is removed

Rehash all is now offered only from the Rehash sheet (decisions 3 and 4).

### 3. When Rehash all is offered

- **Rule:** Rehash all is offered on a Court's Rehash only when **another Idle Court holds a Lineup**.
- **Why:** an Idle Court waiting for players adds nothing to Rehash all.
- **Where it applies:** the choice sheet (decision 4) and the Rehash all option in the blocked sheet. This replaces the current `canRehashAll(session)` check in `CourtCard.tsx`.

### 4. Rehash opens a choice sheet when Rehash all is possible

What tapping Rehash on an Idle Court with a Lineup does:

| Situation | Result |
|---|---|
| Blocked (`rehashBlock` not null) | Blocked sheet, unchanged: "No one else can come in", New Teams / Rehash all idle courts / Swap anyway / Cancel. Rehash all follows decision 3. |
| Not blocked, and another Idle Court holds a Lineup | Choice sheet (below) |
| Not blocked, no other Idle Court with a Lineup | Rehash runs at once, as today |

The choice sheet:

- Title: "Rehash Court N"
- **"Just this court"**: primary, has the initial focus, runs `rehashCourt`.
- **"Rehash all idle courts"**: outline, with the existing "Also changes the Lineup on Court …" text as its accessible description. Runs `rehashAll`.
- **Cancel**
- No "Swap anyway".

The sheet closes on any choice. A refusal shows the usual toast.

## Out of scope

- No change to the wording of the Spare players text, the Rehash or Rehash all rules, or the glossary.

## E2E workflows

`e2e/session-courts.spec.ts`:

- With few Spare players, the "Few spare players" icon shows in the Courts header. Tapping it opens the popover with the notice text. Tapping it again, tapping outside or pressing Escape closes it.
- With plenty of Spare players, there is no icon.
- The icon goes away and comes back as players or Courts change (adding a player, Sitting out).
- There is no "Rehash all" button in the Courts header.
- With two Idle Courts that hold Lineups, Rehash opens the "Rehash Court N" sheet:
  - "Just this court" changes only that Court's Lineup.
  - "Rehash all idle courts" changes both.
  - Cancel changes nothing.
- With one Idle Court (the other Busy or waiting for players), Rehash acts at once with no sheet.
- Remove the tests for the ✕ dismissal and for the header Rehash all, including the localStorage key check.

`e2e/emulator/shared-sessions.spec.ts`:

- The host sees the icon. The person who can only view sees no icon.
