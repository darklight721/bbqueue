# Spec: Foundation — data model, storage, shared components

Status: done

Cross-cutting pieces every screen relies on. Vocabulary per `GLOSSARY.md`. Decisions: ADR-0001 (local-only storage), ADR-0002 (Session players are snapshots).

## Stack

Vite+ (pnpm), React 19, TypeScript 7 (strict), wouter (browser history routing), Tailwind 4 + daisyUI 5, vite-plugin-pwa, Vitest + React Testing Library (jsdom), Playwright (Chromium "Pixel 7" + WebKit "iPhone 14", against `vp preview`).

## Routes

| Path | Screen |
| --- | --- |
| `/` | Home |
| `/clubs` | Clubs |
| `/clubs/new` | New club |
| `/clubs/:clubId` | Edit club (unknown id → redirect `/clubs`) |
| `/session/new` | New session |
| `/session` | Session (no saved Session → redirect `/`) |
| `/session/summary` | Session summary (no saved summary → redirect `/`) |
| anything else | redirect `/` |

## Data model (TypeScript, persisted as JSON)

```ts
type SkillLevel = 'beginner' | 'intermediate' | 'advanced'   // Skill value 1 / 2 / 3
type PointSystem = 21 | 31

interface ClubPlayer { id: string; name: string; skill: SkillLevel }
interface Club { id: string; name: string; players: ClubPlayer[] }

interface SessionPlayer {
  id: string; name: string; skill: SkillLevel
  clubPlayerId: string | null      // null for Guests not saved to the Club
  sittingOut: boolean
  removed: boolean                 // removed players stay for history lookups, hidden from lists
  joinedAt: number                 // epoch ms
}

type Team = [playerId: string, playerId: string]

interface Court { id: string; number: number; lineup: Lineup | null; activeMatchId: string | null }
interface Lineup { teams: [Team, Team] }

interface Match {
  id: string; number: number        // 1-based sequence of *Ended* matches, assigned on end
  courtNumber: number
  teams: [Team, Team]
  startedAt: number; endedAt: number | null
  score: [number, number] | null    // null = ended without score
  status: 'active' | 'ended'        // Removed matches are deleted outright
}

interface Queue { id: string; slots: [[string | null, string | null], [string | null, string | null]] }

interface Session {
  id: string; name: string; clubId: string | null
  pointSystem: PointSystem; plannedHours: number
  startedAt: number
  players: SessionPlayer[]; courts: Court[]; matches: Match[]; queues: Queue[]
  streakResetAt: Record<string, number>  // playerId → epoch ms of last Sitting-out reset (see queueing-engine)
}
// Match additionally records `freeAtStart: string[]` (Free players not in it when it started) for Streak/Rest.

interface SessionSummary {
  sessionName: string; totalMatches: number; totalPlayers: number
  startedAt: number; endedAt: number
  topWinners: { place: number; name: string; skill: SkillLevel; wins: number; played: number }[]
}
```

Field names are a guide; the engine spec may refine Session internals (e.g. how Streak/Rest is tracked) as long as it's serialisable.

## Storage

- localStorage keys: `bq:v1:clubs` (Club[]), `bq:v1:session` (Session | absent), `bq:v1:summary` (SessionSummary | absent).
- A small typed storage module with load/save per key; JSON parse failures or shape mismatches → treat as absent (do not crash). Include a schema `version` in each stored object for future migration.
- Session is saved on **every change** (not only on navigation).
- IDs: `crypto.randomUUID()`.

## Validation rules (shared)

- Names are trimmed; empty names invalid.
- Club names unique case-insensitively across Clubs.
- Player names unique case-insensitively within a Club, and within a Session (among non-removed players).

## Shared component: PlayerRowEditor / AddPlayerForm

One component used on Club edit, New session (Guests) and Session (add player):
- Name text field + Skill level select (Beginner / Intermediate / Advanced; default **Intermediate**).
- Inline validation messages (empty, duplicate name).
- Optional "Save to club" checkbox, **unchecked by default**, shown only when the caller passes a Club context (New session with a Club selected; Session that has a Club).

Club edit uses it as an editable row list (name + skill + remove button) plus an "Add player" button; New session/Session use it as an add-one-player form.

## Shared UI conventions

- Mobile-first; daisyUI themes: light (default, high contrast for bright halls) and dark via `prefers-color-scheme`. Final visual direction set by @designer.
- Every screen except Home has a Back button in a top bar.
- Player display everywhere on the Session screen: name + Skill level badge + matches-played count.
- Confirmation dialogs (daisyUI modal) for destructive actions.

## PWA

- Precache app shell; `navigateFallback: /index.html`; works fully offline after first load.
- Update strategy: `registerType: 'prompt'` — show a toast "New version available — Reload"; never auto-reload.
- Manifest: name "BBQueue" (description "Better Badminton Queue"), standalone, icons 192/512/maskable.

## Acceptance

- Storage module unit-tested (round-trip, corrupt JSON → absent).
- Shared player component RTL-tested (default skill, validation, checkbox visibility/default).
- E2E: app loads offline after first visit (Chromium; WebKit if SW supported in Playwright WebKit).
- E2E: update toast covered by unit test only (hard to e2e).
