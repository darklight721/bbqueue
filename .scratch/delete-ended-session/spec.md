# Delete an Ended session; show which Clubs you can start a Session on

Status: ready-for-agent

Decided in a grilling session. Glossary updated (Ended session, Organizer); ADR-0005 amended (manual delete, Consequences).

## Changes

### 1. Who may delete an Ended session
New `canDeleteEndedSession` in `src/domain/permissions.ts`:
- No Club, or a Local club (or a Club no longer on the device): whoever holds the device.
- Shared club: only an Organizer, by their Role now. A former Session host who is now a Player can't delete, even though the device holds its own copy.
The Security Rules already allow delete of `clubs/{clubId}/endedSessions/{sessionId}` for Organizers only; keep the rules test covering a Player being refused.

### 2. Ended session screen: "Delete session"
- A "Delete session" button at the bottom of the Ended session screen (`EndedSessionScreen.tsx`), shown only when the viewer may delete (§1). Players see nothing.
- Opens the existing `ConfirmDialog`. Copy: title "Delete this session?"; body "<name> and its matches will be gone for good." For a Shared club add: "Everyone on <club> loses it too." Confirm "Delete", cancel "Keep".
- On success: back to where the user came from (`originBackPath(origin)`: the filtered list, the Club's list, or the plain list), replacing history so Back doesn't land on the deleted session.
- Not on Past sessions rows, not on the Session summary screen. Opening a deleted session's summary/details URL redirects to the list as today.

### 3. Deleting, by kind
- No Club / Local club: removed from the device's Ended sessions. Works offline.
- Shared club: deleted on the server, then from this device's shared cache and from the device's own copy (when this device hosted it). Needs a connection: while offline the button is disabled with a short note ("Deleting needs a connection."), same pattern as New session for Shared clubs. On failure: stay on the screen, show an error, nothing removed locally.
- Other devices: the shared Ended sessions cache (`applyEndedSessionsReport` in `src/storage/store.ts`) must drop an Ended session the server no longer has, instead of keeping whatever it already cached. The hosting device's own copy is also dropped once the server no longer has it (it may be another Organizer who deleted it).
- Backend: add the delete to the Backend interface and every implementation (Firebase, in-memory, simulated, local fake), with contract tests.

### 4. Clubs page: "Player" badge
On each Shared club row where the viewer's Role is Player, a small neutral badge "Player" in the line with the player count, like "This device only" ("8 players · [Player]"), with no caption: the New session note (§5) explains it where it matters. Organizer rows and Local club rows get no Role badge. The badge is part of the row's accessible description.

### 5. New session: explain the missing Clubs
Only when the viewer is a Player (not Organizer) in at least one Shared club, which New session therefore doesn't list, show one line under the Club picker: "Clubs where you're a Player aren't listed: only an Organizer can start a session." When every Club is hidden, the line still shows where the picker would be. No line when there are no such Clubs.

## E2E workflows

- `ended-sessions` (local fake Backend, both mobile projects): open an Ended session with no Club → Delete session → confirm → back on Past sessions, the session gone, still gone after reload. Cancel keeps it.
- `ended-sessions`: delete from a Club's filtered list → Back target is that filtered list.
- `e2e/emulator/` (two people): Organizer deletes a Shared club's Ended session → it disappears for the Player too (and after their reload). The Player sees no Delete session button.
- `e2e/emulator/`: Organizer offline → Delete session disabled with the connection note.
- `new-session` (local fake Backend or emulator): Account is a Player in a Shared club → the note shows and the Club isn't listed; with only Organizer/Local clubs the note isn't shown.
- Clubs page "Player" badge: None — visual change; Role logic covered by unit tests.
