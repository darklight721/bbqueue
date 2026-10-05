# BBQueue

**Balanced Badminton Queue**: an offline-first PWA for running badminton doubles at a club night. It decides who plays on which court, with whom, and when, keeping rotation fair and teams balanced.

## Features

- **Clubs**: keep a roster of Club players, each with a Skill level (Beginner, Intermediate, Advanced).
- **Sessions**: start a night of play for a Club, choose the number of Courts and a Point system (21 or 31), and add Guests on the fly.
- **Lineups**: each Idle Court gets a proposed Lineup of four players split into two Teams. Use **Rehash** to get a new Lineup for one Court, or **Rehash all** to redo every Idle Court.
- **Queues**: build a pair of Teams by hand and move it onto a Court instead of that Court's Lineup.
- **Matches**: start, time, score, end, or remove Matches. Players can be marked as Sitting out without leaving the Session.
- **History and summary**: see the Ended matches for the Session, the Top winners, and up to 50 past Ended sessions.
- **Shared active session**: an Organizer starts a Session for a Shared club and becomes its Session host. They run it offline as usual, and their device uploads the latest copy when online. Everyone else on the Club sees it live and read-only on Home and the Session screen, with how old their copy is when it isn't live. Another Organizer can take over as host, Players can ask the host to switch their Sitting out or let them leave, and when the host ends the Session its Ended session is kept for the whole Club. A Local club can be made shared, and an Account can be deleted (its Account ID is never reused).
- **Offline first**: everything is saved on the device after every change, and a Shared club's Sessions and Clubs are cached there too, so the app works without a connection. Without a Firebase config there's no backend, no Accounts, and no sync (see `.env.example`; `VITE_BACKEND=fake` runs a local fake backend for development and e2e).

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
- Firebase (Anonymous Auth + Firestore with its offline cache) for Accounts and Shared clubs, behind one `Backend` boundary (`src/backend/`), with Security Rules in `firestore.rules`
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
| `pnpm test:firebase` | Contract and Security Rules tests on the Firebase emulators (needs Java) |
| `pnpm emulators` | Start the Auth and Firestore emulators for local development (needs Java) |
| `pnpm e2e`     | Build, serve, and run the Playwright tests in `e2e/`. It always starts the Firebase emulators, so it needs Java (see below) |

### Java and the Firebase emulators

The Firebase emulators run on Java. `pnpm test:firebase`, `pnpm emulators` and `pnpm e2e` need `java` on your `PATH`; plain `pnpm test`, `pnpm check` and `pnpm dev` don't. `pnpm e2e` always starts the emulators (even for a single spec that doesn't use them), because its Playwright config lists them as a web server; its `e2e/emulator/` specs run two browser contexts against them. With Homebrew's keg-only OpenJDK:

```sh
export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH
```

The emulators use fixed ports (Auth 9099, Firestore 8085) and the demo project `demo-bbqueue`, so no Firebase project is needed. Only one run at a time can use them. To try the app against them, run `pnpm emulators` and, in another terminal, `VITE_FIREBASE_EMULATOR=1 pnpm dev`.

`pnpm e2e` serves two builds: the one on the local fake backend (port `E2E_PORT`, default 4173) for single-device specs (projects `chromium-mobile` and `webkit-mobile`), and one on the emulators (port `E2E_EMULATOR_PORT`, default `E2E_PORT` + 1) for the specs in `e2e/emulator/` (projects `chromium-mobile-emulator` and `webkit-mobile-emulator`).

To regenerate the PWA icons from `public/favicon.svg`:

```sh
pnpm exec pwa-assets-generator
```

## Setting up a real Firebase project

Everything above runs on the emulators or the local fake, with no Firebase project. To use real Accounts and Shared clubs:

1. **Create the project.** In the Firebase console, turn on **Anonymous** sign-in under Authentication, and create a Firestore database in **production mode** (not test mode, which leaves it open for a limited time). Register a web app and copy its config into `.env.local` as the `VITE_FIREBASE_*` variables (see `.env.example`).
2. **Deploy the Security Rules.** `.firebaserc` defaults to the demo project `demo-bbqueue` (what the emulators use), so add your project as an alias first (`firebase use --add`), then run `pnpm exec firebase deploy --only firestore:rules`. The rules are the only thing that protects the data, so don't skip this.
3. **Turn on App Check.** Create a reCAPTCHA Enterprise key for the site's domain, register it under App Check in the Firebase console, and set it as `VITE_FIREBASE_APP_CHECK_SITE_KEY`. Watch the App Check metrics until the requests show as verified, then enforce it for Firestore and Authentication. Until then, a script can create Accounts, Clubs and large documents without limit.
4. **Restrict the API key** in the Google Cloud console to the site's HTTP referrers and to the Identity Toolkit, Token Service, Cloud Firestore and Firebase App Check APIs (App Check exchanges its reCAPTCHA token with this key, so leaving that API out breaks it).
5. **Stay on the Spark plan or set a budget alert.** On Spark, running out of quota takes the app down for the day.
6. **Check offline cold starts.** The Firebase code is a lazy-loaded chunk (about 650 KB today). Make sure the service worker precaches it, or the app won't start offline from a cold start: `workbox.globPatterns` in `vite.config.ts` covers it, but Workbox skips files over 2 MiB by default, so check again if the chunk grows.

The GitHub Pages workflow in `.github/workflows/deploy.yml` reads the `VITE_FIREBASE_*` values from the repository's Actions **variables** (Settings → Secrets and variables → Actions → Variables). Without them, a deploy has no Accounts.

## Project structure

```
src/
  app/          App shell, routes and the error boundary
  backend/      The one boundary to the server (ADR-0006): the Backend interface with an in-memory, a local
                fake and a Firebase version, their contract tests, and the sync of Active sessions
  components/   Shared UI components
  domain/       Types, validation, Roles, and the queueing engine
  features/     Screens: welcome, account, home, clubs, club-edit, new-session, session,
                session-summary, past-sessions
  storage/      localStorage persistence and the app store
  test/         Test setup and emulator helpers
e2e/            Playwright specs (e2e/emulator/: two people on the Firebase emulators)
scripts/        Helper scripts (emulators wrapper)
firestore.rules Firestore Security Rules (tested with `pnpm test:firebase`)
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
  - [0006 Anonymous Accounts and Shared clubs on Firebase](docs/adr/0006-anonymous-accounts-and-shared-clubs-on-firebase.md)
  - [0007 One Session host per Active session](docs/adr/0007-one-session-host-per-active-session.md)

## Data

- **On the device**: Local clubs, the device's own Session (no Club, or a Local club) and its Ended sessions, and the Account the device was created with are stored per device and per browser under `bq:v1:*` keys in `localStorage`. Clearing site data deletes them, and an Account is bound to the device it was created on (ADR-0006).
- **On the server** (with an Account): Shared clubs, their Active session, Ended sessions and Player requests live in Firestore. The device keeps a cached copy under `bq:v1:shared-*` so they show offline; "Clear shared data" (shown if the app ever fails to display something) drops that cache, and it comes back from the server.
