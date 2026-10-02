# Spec: Ended sessions (past sessions)

Status: done

Vocabulary: `GLOSSARY.md` (**Session**, **Ended session**, **Top winners**). Decisions: `docs/adr/0001-local-only-storage-no-backend.md`, `docs/adr/0005-keep-last-50-ended-sessions-slimmed.md`. Replaces the persisted summary from `.scratch/session-summary/spec.md`.

## Domain

- **EndedSession** (new type, slimmed per ADR-0005):
  - `id` (the Session's id), `name`, `clubId`, `pointSystem` (at end), `startedAt`, `endedAt`.
  - `players`: `{ id, name, skill }`, **only Session players who played ≥ 1 Ended match**. "Players" count = `players.length`.
  - `matches`: Ended matches only: `{ number, courtNumber, teams, target, startedAt, endedAt, score }`. No `freeAtStart`, no match id, no status.
  - Not kept: lineups, queues, courts, `streakResetAt`, `sittingOut` / `removed` / `joinedAt` / `clubPlayerId`, `plannedHours`.
- `endSession(session, ctx)` ends Active matches without a Score (as today) and returns the EndedSession, or **`null` when there are 0 Ended matches**.
- `buildSummary(ended: EndedSession): SessionSummary` is pure and derived from the stored EndedSession. Nothing else stores a summary.
- **Top winners ranking** (changed): wins desc → **losses asc** → **played desc** → name A–Z (display order only). A shared place needs equal wins, losses **and** played. Competition ranking (1, 1, 3); show all with place ≤ 3; only players with ≥ 1 win. A loss = a scored Ended match where the player's Team had fewer points. Unscored matches count as played only.

## Storage

- Key `bq:v1:ended-sessions`: an array of EndedSession in the usual `{ version, data }` envelope. Exposed **newest first by `endedAt`**.
- Adding one: put it first, keep at most **50** (drop the oldest by `endedAt`). If the write throws (quota), drop the oldest and retry until it fits or the list holds only the new one. If it still fails, log it (no crash).
- The old key `bq:v1:summary` is removed on load and never written again. The summary slot/hooks are deleted.
- Store API (same in-memory cache + cross-tab `storage` event pattern as clubs/session): `useEndedSessions()`, `getEndedSessions()`, `addEndedSession(ended)`.

## Routes

| Path | Shows |
|---|---|
| `/sessions/new` | New session (was `/session/new`) |
| `/sessions` | Past sessions list (empty state if none) |
| `/sessions/:id` | The live Session screen if `:id` is the Active session's id, else that Ended session's details, else redirect `/sessions` |
| `/sessions/:id/summary` | End-of-night summary for that Ended session; unknown id → redirect `/sessions` |

- Old `/session*` paths are not kept; the catch-all already redirects them Home.
- Home "Resume session" → `/sessions/<activeId>`; "New session" → `/sessions/new`; creating a session navigates to `/sessions/<newId>`.

## End session flow

- Confirm (unchanged) → `endSession`. If an EndedSession comes back: `addEndedSession`, clear the Active session, then navigate to `/sessions/<id>/summary`. If `null`: clear the Active session and navigate to `/`.
- The summary screen's **Home** button just goes to `/` (nothing to clear). Starting a new session no longer clears anything summary-related.

## Screens (design by @designer)

- **Home**: a "Past sessions" action linking to `/sessions`, shown only when ≥ 1 Ended session exists.
- **Past sessions list** (`/sessions`): newest first. Each row shows name, date, matches played and players, and links to `/sessions/:id`. Empty state when there are none.
- **Ended session details** (`/sessions/:id`): name, date, start–end time, duration; totals (matches played, players); Top winners (same rules/look language as the summary); all matches **oldest first** in the History row format ("Match #n · Court N", Teams with Skill, score or "No score", duration; the Target only if both 21 and 31 were used). **No** summary link and **no** delete.

## Acceptance

- Unit: ranking tie-breaks (losses before played; shared place only when all three are equal); 50-cap; quota retry drops oldest; slimming drops live-only fields; `endSession` returns `null` with 0 Ended matches; old summary key removed.
- e2e: play and score → End session → `/sessions/<id>/summary` correct → Home shows Past sessions → list row correct → details shows matches oldest first. Reload keeps everything. End with no matches → Home, nothing stored, no Past sessions button. Unknown `/sessions/xyz` → `/sessions`. All existing e2e pass on the new paths.
