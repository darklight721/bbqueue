# Club players joining late, and changing Skill levels mid-session

Status: done

Follow-up to `.scratch/session/spec.md` and `.scratch/session-tweaks/spec.md`. Vocabulary: `GLOSSARY.md` (see **Guest**, **Club player**, **Session player**, **Skill level**, **Session host**). Decision: `docs/adr/0002-session-players-are-snapshots.md` (players are copied when they join; the copy goes one way unless the host chooses).

Only whoever can change the Session (the Session host, or the device for a Local club or a Session with no Club) sees any of this. Players watching a Shared club's Session see neither the Add players button nor the row menus.

## 1. Add players sheet

- The inline Add player form in the Players section is replaced by an **Add players** button. It opens a bottom sheet (centred dialog on wider screens) titled "Add players".
- **From <Club>** (only when the Session has a Club that still exists on this device): one tile with a checkbox for each Club player with no active Session player, sorted by name. Each tile shows the name and the Club player's Skill level.
  - A Club player who was in the Session and was Removed (or left) shows "Left earlier". Adding them brings back the same Session player and history, matched through their Club player link (by name only if the link is missing), with a "Welcome back" message.
  - A Club player whose name matches a Guest already in the Session shows "Name taken" and can't be ticked.
  - When everyone on the roster is in the Session, it says so instead of showing tiles.
- **Guests**: the existing name + Skill level form (+ "Save to club" when there is a Club). "Add guest" puts the Guest in the sheet as a tile (with ✕ to drop them). Nobody joins yet.
  - A name that matches a Club player who is not in the Session is rejected: "<Name> is in <Club>. Pick them above."
  - A name already taken in the Session, or by another Guest in the sheet, is rejected as today ("Name already used").
- **Add N players** adds every ticked Club player and every Guest in one change, then closes the sheet. Nothing ticked and no Guests: the button says "Add players", and tapping it shows "Pick players or add a guest first." ("Add a guest first." without a Club) instead of closing. Cancel / Escape / the backdrop close the sheet and nobody joins (no ✕: the ticks and Guests are a draft, so leaving it is a Cancel).
- A Club player joining late is copied like at Start: name, Skill level, Club player link, and the linked Account ID at the moment they join. They are not a Guest.
- "Save to club" Guests are added to the Club roster after the Session change succeeds. A failed roster save keeps the Session change and shows a message, as today.

## 2. Player menu

- The ✕ on each Players row becomes a ⋮ button "More for <Name>". It opens a sheet titled with the player's name.
- **Skill level**: three choices (Beginner, Intermediate, Advanced), the current one picked.
  - **Also update in <Club>** checkbox, unticked, only when the Session player is linked to a Club player still on the Club roster.
  - **Save** applies the change and closes the sheet. Cancel / Escape / the backdrop close it without changing anything (no ✕: the sheet holds a draft, so leaving it is a Cancel).
  - The new Skill level counts from the next Lineup the app picks. Lineups already shown, Queues and Active matches are untouched.
  - With the checkbox ticked, the Club player's Skill level is updated too. A failed roster save keeps the Session change and shows a message.
- **Remove** (beside Cancel, in one row of equal halves): closes the sheet and asks the existing "Remove <Name> from this session?" confirmation. For a player in an Active match it is greyed out with "On court. End or remove their match first." under it, and tapping it does nothing.
- The Ended session keeps each player's Skill level as it was at the End.

Not in scope: saving a Guest to the Club from the menu (follow-up).

## E2E workflows

In `e2e/session-players.spec.ts`:

- Add players sheet: tick two Club players and add a Guest, then Add 3 players; all appear in the list, the Club players keep their Club player link and Skill level, the Guest has none.
- Add players sheet: Cancel closes it and nobody joins; opening it again starts with nothing ticked and no Guests.
- A Removed Club player shows "Left earlier" and comes back with their history.
- A Guest name that matches a Club player not in the Session is rejected with the "Pick them above" message.
- The existing Add player workflows move into the sheet (Enter adds the Guest tile, duplicate names, Save to club, no Club means no From <Club> and no Save to club, re-adding a removed name).
- Player menu: change a Skill level and Save; the row and the stored Session show it, the Club is unchanged. With "Also update in <Club>" ticked, the Club player changes too. Cancel closes without changing anything.
- Player menu: Remove asks to confirm, and is blocked with a message for a player on court.
