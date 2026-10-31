---
name: firestore-rules
description: How to change bbqueue's Firestore Security Rules safely. Use when editing firestore.rules, changing what the Firebase Backend writes (src/backend/firebase*.ts), or adding a field, document or collection to the Firestore data.
---

`firestore.rules` is the only thing protecting Shared club data: any signed-in anonymous Account can write to Firestore directly, bypassing the app. A rules change is done when the rules, the doc comment, the Backend, its fakes and the tests all agree.

## The rules file's header is the data model

The comment at the top of `firestore.rules` is the source of truth for the document shapes, the `memberUids`/`organizerUids` index, the Roles, and what the rules deliberately leave to the app ("Not enforced here"). When the data shape or an access rule changes, update that header in the same change. Read it before reasoning about any rule.

The index gotcha: every write that links, unlinks or changes a Role updates the row **and** the index in one batch, and the rules check the index as it will be after the batch (`getAfter`). A Backend write that splits these across batches is rejected.

The decisions behind the model are ADR-0006 (anonymous Accounts, Shared clubs), ADR-0007 (one Session host) and ADR-0008 (a new Shared club's first batch may link Accounts). A change that adds or loosens an invariant gets a new ADR in `docs/adr/` (the `domain-modeling` skill records one).

## Where each change is tested

- **Rules** → `src/backend/firestore.rules.emulator.test.ts`, inside the `describe` block for the area (Account rules, Shared club rules, Linking Accounts and Roles, The last Organizer, Leaving a Club, Shared Active session, Players' requests, Ended sessions of a Shared club, Making a Local club shared). Each changed rule gets an allowed case and at least one denied case: a stranger, the wrong Role, or a forbidden field.
- **Backend behaviour** → the contract suites `src/backend/backend*.contract.ts`. They run against the in-memory, local fake and Firebase Backends (`inMemoryBackend.test.ts`, `localFakeBackend.test.ts`, `firebaseBackend.emulator.test.ts`), so a contract case keeps the fakes in step with Firebase. When the rules start rejecting something, make the fakes reject it too, or e2e on the fake Backend passes what production refuses.
- **What reaches the server** (fields, batching) → the "Firebase emulator: what reaches the server" block in `firebaseBackend.emulator.test.ts`.
- **Two-person behaviour in the UI** → `e2e/emulator/` (see `AGENTS.md`).

## Running

1. For a fast syntax and semantics pass, use the Firebase MCP's `firebase_validate_security_rules` tool when it's connected.
2. Run one emulator file while iterating:
   `pnpm exec firebase emulators:exec --only auth,firestore --project demo-bbqueue "FIREBASE_EMULATOR_TESTS=1 vp test src/backend/firestore.rules.emulator.test.ts"`
3. Before committing, run the full `pnpm test:firebase` (needs Java; see `README.md`). The emulator tests run one file at a time against shared emulator data, cleared in `beforeEach`.
4. Before committing, dispatch the `rules-security-reviewer` subagent on the change.

Deploying the rules (`firebase deploy --only firestore:rules`) is the user's step: leave it to them and mention it when the change is ready.
