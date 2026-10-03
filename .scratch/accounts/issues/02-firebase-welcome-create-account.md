# 02: Firebase setup + Welcome + create Account

**What to build:** On first launch the person sees a Welcome screen. They can enter their name to create an Account, which gets a unique, readable, never-changing Account ID, or skip. Either choice is remembered, so the Welcome screen doesn't appear again. Offline, it explains that an Account needs a connection and lets them continue.

This ticket also lays the groundwork every later ticket uses:
- the Firebase project config
- the `Backend` boundary, in a Firebase version and an in-memory version, with one contract test suite run against both
- the Firebase emulator wired into Vitest (contract and Security Rules tests) and Playwright
- the first Security Rules: an Account can only write itself, and Account-ID records can't be overwritten

See ADR-0006 and `.scratch/accounts/spec.md` (stories 1–7, Implementation Decisions: Backend, Backend interface, Store, Account ID).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Firebase (Firestore + Anonymous Auth) set up for the static SPA, with the Firestore offline cache on. The existing signed-out experience is untouched.
- [x] A `Backend` boundary with Firebase and in-memory versions (plus a local fake persisted in localStorage for e2e). UI code never imports Firebase directly.
- [x] Domain function: Account ID from a name, following the rules in the spec (slug, dash, 4 characters with no look-alikes), compared ignoring case. Unit-tested.
- [x] Creating an Account reserves the Account ID in a transaction, tries again if it's taken, and stores the name
- [x] Contract tests pass against both versions. Security Rules tests pass on the emulator.
- [x] Welcome screen: shown on first launch only, and remembers whether the person created an Account or skipped
- [x] Offline on the Welcome screen: a clear message, and continuing without an Account works
- [x] The e2e setup can start the emulator and clear it between tests. Fixtures can seed an Account.
- [x] The existing e2e suite still passes for signed-out use

## E2E workflows

- First launch → Welcome → enter a name → Home. After a reload, no Welcome screen, and the Account still exists.
- First launch → Skip → Home. After a reload, no Welcome screen.
- First launch while offline → message → continue → Home without an Account.

## Comments

Deferred: Firebase emulator, Security Rules tests and Firebase-backed contract/e2e tests — no Java on dev machine; e2e uses the local fake Backend (VITE_BACKEND=fake).

Still open (unticked above because nothing has run against real Firebase yet): Firebase project set-up and the Firebase `Backend` verified against the emulator; the transactional Account ID reservation/retry on Firebase; contract + Security Rules tests on the emulator; emulator start/clear and Account seeding in the e2e setup (`seedStorage(page, { account })` already seeds the app and the local fake).

Done so far: `Backend` interface (`src/backend/backend.ts`) with Firebase (`firebaseBackend.ts`, lazy-loaded only when `VITE_FIREBASE_*` is set), in-memory and local fake versions; one contract suite (`backend.contract.ts`) run against in-memory and local fake; Welcome screen; Account ID domain functions.

Resolved: Java is available, so everything deferred above now runs on the Firebase emulators (Auth + Firestore, demo project `demo-bbqueue`; see the README for the Java `PATH`):
- `pnpm test:firebase` runs both Backend contract suites against the Firebase version, plus Security Rules tests (`src/backend/*.emulator.test.ts`).
- `VITE_FIREBASE_EMULATOR=1` points the Firebase Backend at the emulators with no real project; `e2e/emulator/*.spec.ts` run on such a build with two real browser contexts (`pnpm e2e` starts the emulators and both builds). Fixtures: `e2e/emulator/emulator.ts` (`signUp`, `seedSharedClub`, `readServerClub`, …) and `src/test/emulatorAdmin.ts`.

Not covered: a real Firebase project (create one, put its `VITE_FIREBASE_*` values in the deploy environment, and deploy `firestore.rules`).
