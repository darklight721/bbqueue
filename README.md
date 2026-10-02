# BBQueue

**Better Badminton Queue**: an offline-first PWA for running badminton doubles at a club night. It decides who plays on which court, with whom, and when, keeping rotation fair and teams balanced.

## Features

- **Clubs**: keep a roster of Club players, each with a Skill level (Beginner, Intermediate, Advanced).
- **Sessions**: start a night of play for a Club, choose the number of Courts and a Point system (21 or 31), and add Guests on the fly.
- **Lineups**: each Idle Court gets a proposed Lineup of four players split into two Teams. Use **Rehash** to get a new Lineup for one Court, or **Rehash all** to redo every Idle Court.
- **Queues**: build a pair of Teams by hand and move it onto a Court instead of that Court's Lineup.
- **Matches**: start, time, score, end, or remove Matches. Players can be marked as Sitting out without leaving the Session.
- **History and summary**: see the Ended matches for the Session, the Top winners, and up to 50 past Ended sessions.
- **Offline and local-only**: everything is saved in the browser's `localStorage` after every change. There's no backend, no accounts, and no sync.

### Queueing rules

Lineups follow these rules in priority order (see [ADR-0003](docs/adr/0003-queueing-rule-priority.md)):

1. **Rest**: avoid a third back-to-back Match.
2. **Fairness**: pick whoever has played fewest Matches in the Fairness window, then fewest overall, then whoever has waited longest.
3. **Team balance**: the two Teams' Skill totals differ by at most 1.
4. **New partners**: repeat partnerships as little as possible.

## Tech stack

- React 19 + TypeScript, routing with [wouter](https://github.com/molefrog/wouter)
- [Vite+](https://viteplus.dev) (`vp`) for dev server, build, test (Vitest), lint (oxlint), and format
- Tailwind CSS 4 + daisyUI 5
- `vite-plugin-pwa` (Workbox) for offline support and update prompts
- Testing Library + jsdom for unit/component tests, Playwright for end-to-end tests (mobile Chromium and WebKit)

## Getting started

Requires Node.js and pnpm. The pinned pnpm version is set in `package.json` under `devEngines`, and pnpm downloads it if it's missing.

```sh
pnpm install
pnpm dev
```

## Scripts

| Command        | What it does                                                    |
| -------------- | --------------------------------------------------------------- |
| `pnpm dev`     | Start the dev server                                            |
| `pnpm build`   | Production build to `dist/`                                     |
| `pnpm preview` | Serve the production build locally                              |
| `pnpm test`    | Run unit and component tests (`src/**/*.test.{ts,tsx}`)         |
| `pnpm check`   | Format, lint, and type-check                                    |
| `pnpm e2e`     | Build, serve on port 4173, and run Playwright tests in `e2e/`   |

To regenerate the PWA icons from `public/favicon.svg`:

```sh
pnpm exec pwa-assets-generator
```

## Project structure

```
src/
  app/          App shell and routes
  components/   Shared UI components
  domain/       Types, validation, and the queueing engine
  features/     Screens: home, clubs, club-edit, new-session, session, session-summary, past-sessions
  storage/      localStorage persistence and the app store
  test/         Test setup
e2e/            Playwright specs
docs/adr/       Architecture decision records
GLOSSARY.md     Domain terms used across the code and UI
```

## Docs

- [GLOSSARY.md](GLOSSARY.md): the domain language (Session player, Lineup, Rehash, Streak, and so on). Use these terms in code, UI copy, and issues.
- [docs/adr/](docs/adr/): architecture decisions:
  - [0001 Local-only storage, no backend](docs/adr/0001-local-only-storage-no-backend.md)
  - [0002 Session players are snapshots](docs/adr/0002-session-players-are-snapshots.md)
  - [0003 Queueing rule priority](docs/adr/0003-queueing-rule-priority.md)
  - [0004 Match keeps its Target](docs/adr/0004-match-keeps-its-target.md)
  - [0005 Keep last 50 ended sessions, slimmed](docs/adr/0005-keep-last-50-ended-sessions-slimmed.md)

## Data

All data is stored per device and per browser under `bq:v1:*` keys in `localStorage`. Clearing site data deletes your Clubs and Sessions.
