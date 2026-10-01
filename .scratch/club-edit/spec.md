# Spec: New club / Edit club screen

Status: done
Depends on: foundation, clubs

Routes: `/clubs/new`, `/clubs/:clubId` (unknown id → redirect `/clubs`)

## Content

- Top bar: Back, title "New club" or "Edit club".
- Club name field.
- List of Club players, each row using the shared player editor: name field, Skill level select, Remove button.
  - On open, rows are sorted **alphabetically** by name. Rows added during editing stay where added (appended); re-sorting only happens next time the screen opens.
- **Add player** button: appends an empty row (Skill level defaults to Intermediate) and focuses its name field.
- **Save** button.
- **Delete club** button — only when editing an existing Club.

## Behaviour

- Save validation: Club name required and unique (case-insensitive, excluding itself); every player row needs a non-empty name; player names unique within the Club (case-insensitive). Errors shown inline; nothing saved until valid. A completely empty new row (blank name) on Save → treat as invalid (show error) rather than silently dropping. *(Keeps behaviour explicit.)*
- Clubs with zero players are allowed.
- Save → persist, navigate to `/clubs`.
- Delete → confirm dialog ("Delete <name>? This can't be undone.") → remove, navigate to `/clubs`. A running Session is unaffected (ADR-0002).
- Back with unsaved changes → confirm "Discard changes?"; Back with no changes → leave immediately. "Changed" means the form differs from what was loaded (or from empty for New club).

## Acceptance (e2e)

- Create a Club with 3 players of different skill levels → appears in list with "3 players".
- Edit: players appear alphabetically; rename a player, change skill, remove one, add one → Save → reopen shows changes, sorted.
- Validation: empty Club name, duplicate Club name, empty player name, duplicate player name each block Save with a message.
- Delete hidden on New club; Delete on Edit asks to confirm, then removes it.
- Back with no changes leaves; Back with changes asks; cancelling keeps edits; confirming discards.
