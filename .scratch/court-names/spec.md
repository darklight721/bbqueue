# Spec: Court names

Status: done

Vocabulary per `GLOSSARY.md` (adds **Court name**).

## Problem

- Courts are always "Court 1", "Court 2" and so on, counted from 1. A Session on the venue's courts 5 and 6 still shows Court 1 and Court 2, so players have to translate, or walk to the wrong court.
- Some venues don't number their courts at all ("Center", "Hall B").

## Decisions

### 1. What a Court name is

- Free text that replaces the whole label: the Court shows "Center", not "Court Center".
- A new Court starts as "Court N".
- A name that is only digits becomes "Court N": typing "5" gives "Court 5". Anything else is kept as typed.
- The Court's number stays, hidden, as its place in the order.

### 2. What makes a name valid

- 1 to 20 characters, after the usual name clean-up (`normalizeName`).
- Blank is refused.
- Two Courts in a Session can't share a name, ignoring case. The check runs after the digits rule, so "5" is refused next to an existing "Court 5". A Court's own name in a different case is fine.
- Errors show in the sheet, in the same style as other name fields.

### 3. Who can rename, and when

- The Session host only. Read-only viewers see the new name through the usual sync.
- At any time during the Active session, on Idle and Busy Courts.
- Not on an Ended session, and not on the New session screen.

### 4. Where

- A small pencil right after the name in the Court card header, on Busy and Idle Courts. Viewers don't get it.
- It opens `NameSheet`, titled "Edit court name", field label "Court name".
- A long name wraps rather than getting cut off: in the header, on the Move to court buttons and in the player status pills. In Pick a player the pill drops under the name when it doesn't fit beside it.
- A toast says "Court renamed".

### 5. How long it lasts

- The Session only. Clubs don't remember Court names, so the next Session starts at "Court 1" again.

### 6. Past Matches

- A rename also changes the Matches already played on that Court, because it corrects a label rather than moving to another court.
- It reaches only Matches played on that exact Court. "Hall B" has two Matches and is removed; a new Court reuses its number and is named "Hall C"; the two Matches stay "Hall B".
- A Removed Court's Matches keep the name it last had.
- Once the Session has Ended its Matches never change.

### 7. Add court and card order

- A new Court always goes last. It takes the number after the highest one in use, not the lowest free one as it does today, so with Courts 1, 2 and 3, removing Court 2 and tapping Add court gives "Court 4" at the end.
- It skips any number whose "Court N" another Court already uses as its name. With "Court 5" and "Court 6" on the page (numbers 1 and 2), Add court gives "Court 3".
- Cards stay sorted by the hidden number and never by name, so a card doesn't move when it is renamed. "Court 7" can sit above "Court 5".

### 8. Everywhere the name shows

The name is used as written, so lowercase "court 1" in a sentence becomes "Court 1":

- Court card headers and the Remove court label
- End match dialog title
- Rehash sheet title and the Rehash text that names other Courts ("Also changes the Lineup on Court 2.")
- Move to court buttons, and the "Match started on Court 1" toast
- Player status ("On Court 1", "In lineup · Court 2")
- The Queue reason ("Ana is on Court 1")
- The Point system text ("Court 1 at 21")
- Match rows in History and on an Ended session

The Session summary's Courts tile keeps counting as it does today.

### 9. Sessions already running or Ended

- They show "Court N" until someone renames a Court. Old Ended sessions stay "Court N" for good.

## Implementation notes

- Domain: `Court` gets `name`, `Match` gets `courtId` and `courtName`, and an Ended match gets `courtName`. `courtNumber` stays for ordering and the Courts tile.
- Add a `renameCourt(session, courtId, name)` in `operations.ts` that returns errors for not found, required, too long and duplicate, and updates the Court plus its Matches by `courtId`. A Match with no `courtId` (started before this change) is only updated if it is that Court's Active match.
- `parseSession`: cap `name` and `courtName` at the Court name limit. When missing, fall back to `Court ${number}` / `Court ${courtNumber}`, and leave `courtId` absent.
- `addCourt`: highest number plus one, with the name check above. The "adds the lowest unused number" test in `operations.test.ts` changes with it.
- Add a `MAX_COURT_NAME_LENGTH` next to `MAX_NAME_LENGTH`. Unlike that one, nothing in `firestore.rules` repeats it: the whole Session is JSON text to the rules.
- No Security Rules or Backend change. The rename goes through `actions.run` and uploads like any other change.
- Text helpers that take numbers today (`alsoChangesText`, `playerStatus`, `queueText`, `pointSystemText`, `ScoreDialog`, `RehashChoiceSheet`, `MatchRow`) take the name instead. `playerStatus`'s status sort keeps using the number.

## Out of scope

- Clubs remembering Court names.
- Naming Courts on the New session screen.
- Reordering Courts by hand or by name.
- Renaming a Court on an Ended session.

## E2E workflows

`e2e/session-courts.spec.ts`, new describe "Court names":

- The host renames an Idle Court from the pencil. Enter saves, focus goes back to the pencil, and the card, the Move to court button and the player status all show the new name. It survives a reload.
- The host renames a Busy Court. The Match keeps running, and the End match dialog title uses the new name.
- Typing "5" gives "Court 5".
- A blank name and a duplicate (in a different case) are refused in the sheet, and the Court keeps its name.
- A renamed Court doesn't change place among the cards. Add court next to "Court 5" and "Court 6" gives "Court 3".
- With Courts 1, 2 and 3, removing Court 2 and tapping Add court puts "Court 4" last.

`e2e/session-history-end.spec.ts`:

- Matches already played on a Court show the new name in History after a rename, and the name carries through to the Ended session.
- A Removed Court's Matches keep its name when a new Court reuses its number and is renamed.

`e2e/emulator/shared-sessions.spec.ts`:

- The Player watching sees the host's rename arrive, and has no pencil.
