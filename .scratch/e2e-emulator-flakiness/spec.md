# Flaky e2e: shared-club emulator specs time out under the full suite

Status: needs-triage
Type: task

## Problem

The full `pnpm e2e` run doesn't pass reliably, with or without recent changes. A handful of emulator specs time out, and a different set fails each run:

| Run | Code | Workers | Result | Failures |
|---|---|---|---|---|
| Baseline | `e75abda` (before the small-free-pool work) | 2 | 533 passed, 4 failed | chromium-mobile-emulator: `delete-account.spec.ts:15`, `:107`; `delete-ended-session.spec.ts:41`, `:78` |
| With small-free-pool changes | working tree | 2 | 543 passed, 4 failed | webkit-mobile-emulator: `roles.spec.ts:174`, `shared-clubs.spec.ts:99`, `shared-sessions.spec.ts:8`, `:51` |
| With small-free-pool changes | working tree | default / 4 | 5–6 failed per run | `roles`, `delete-account`, `requests`, `shared-sessions` (once at a Club-list click "not stable"), once `welcome` |
| With ticket 02 (Rehash sheet) | working tree | 2 | 553 passed, 4 failed | webkit-mobile-emulator: `delete-account.spec.ts:107`, `make-shared-club.spec.ts:87`, `roles.spec.ts:174`; chromium-mobile: `welcome.spec.ts:260` (passed 5/5 when run alone) |
| With ticket 02 (balance rule) | working tree | 2 | 555 passed, 4 failed | chromium-mobile-emulator: `roles.spec.ts:174`; webkit-mobile-emulator: `roles.spec.ts:174`, `roles.spec.ts:88`, `delete-account.spec.ts:15` |

The failures are 30 s test timeouts or URL/visibility expectations, often inside shared helpers such as `startSession` (`e2e/emulator/sessions.ts:56`).

When the emulator specs run on their own (`pnpm e2e e2e/emulator --workers=2`), all 62 pass. Run alone 5 times on each emulator project, `shared-sessions.spec.ts:51` passes all 10.

## Likely cause (unconfirmed)

The Firebase emulators get too much load when they run in parallel with the fake-Backend projects. Things to check:

- Run the emulator projects serially (`workers: 1` for those projects only).
- Use longer `EMULATOR_EXPECT_TIMEOUT_MS` or test timeouts.
- Check whether the emulator data reset between tests races with the next test.

## Done when

The full `pnpm e2e` passes 3 runs in a row locally with default settings.

## E2E workflows

None — this is about test infrastructure; no new workflows.

## Comments

### 2026-10-30 — still open, worse at 6 workers

Full `pnpm e2e` on `97c24ee` (default workers, 6 on this machine): 512 passed, 1 skipped, 63 failed. Every emulator spec on both emulator projects failed at the 15 s expect timeout in `signUp` (`e2e/emulator/emulator.ts:34`): the Welcome sheet showed "You're offline. Connect and try again", so the app couldn't reach the Auth emulator. Also `welcome.spec.ts:334` failed with "browser.newContext: Target page, context or browser has been closed", and the log shows `Killed: 9 … vp preview --port 4173`, which looks like processes killed under memory pressure. Run on its own right after, `e2e/emulator/account.spec.ts` on chromium-mobile-emulator passed 3/3. Not addressed by any commit since the ticket was written (`playwright.config.ts` and `e2e/emulator/` are unchanged apart from spec edits).

### 2026-10-30 — second run, `e750881`

Full `pnpm e2e` with default workers and no leftover servers, about 11 GB free: 574 passed, 1 skipped, 1 failed in 2.1 min. The failure was chromium-mobile-emulator `shared-sessions.spec.ts:8`: `watchFromHome` (`e2e/emulator/sessions.ts:68`) waited 15 s for Ana's "View session" link on Home and it never appeared. So the earlier 63-failure run was the machine running out of memory, but the usual one-off emulator timeout is still there.

### 2026-10-31 — investigation, paused (still open)

Every run below is a full `pnpm e2e` with default workers (6).

**Baseline on `e750881`.** 574 passed, 1 skipped, 1 failed in 2.5 min. The failure was chromium-mobile-emulator `ended-sessions.spec.ts:8`, in `watchFromHome` (`e2e/emulator/sessions.ts:68`): no "View session" link after 15 s. Ana's Home snapshot showed "Clubs 1 club", but that number comes from localStorage after the reload, so it doesn't prove the live listeners were working.

**How Home finds the Active session (from code reading, @oracle).** Home only reads the store. The store is filled by a chain of listeners, each set up once per page load:

1. `observeCurrentAccount` (`src/backend/firebaseBackend.ts`)
2. the Clubs query on `memberUids` (`firebaseSessions.ts:179-197`)
3. one listener per Club on `clubs/{id}/activeSession/current` (`firebaseSessions.ts:121-157`)

A cached "no document" for a Club becomes "unknown", which makes Home show nothing for it. Nothing checks again later. Candidate causes:

- (a) the Account listener dies and never retries. A real gap, which production could hit too.
- (b) the reloaded page never reaches the server: a stall under load, or the multi-tab cache leaving it as a secondary tab that does no network traffic.
- (c) the emulator doesn't send the document to the restarted listener.
- Security Rules are unlikely to be the cause.

**Fix kept: the Account listener now retries.** `observeCurrentAccount` retries with `retryDelay` after an error, like the other listeners, instead of logging once with `console.error` and giving up for the rest of the page load. Unit tests and `pnpm check` pass. This fixes (a) but didn't make the flakiness go away.

**Heisenbug.** Temporary diagnostics (Ana's console, page errors, navigations and Firestore channel requests through `page.on(...)` listeners) were on for 8 full runs in a row: 4 without the Account fix, 4 with it. All 8 passed: 575 passed, 1 skipped, about 2.1 min each. With the listeners removed, 3 runs gave:

- 1 failed: webkit-mobile-emulator `delete-account.spec.ts:107`, "View session" not visible within 30 s
- 1 failed: chromium-mobile `welcome.spec.ts:334`, "browser.newContext: Target page, context or browser has been closed", which points to memory pressure again
- 1 clean

Attaching the page listeners probably changes the timing enough to hide the failure.

**Passive probe, on a busy machine.** The second attempt only collected evidence after a failure (`page.consoleMessages()`, `page.pageErrors()`, `page.requests()`, and the server document through `adminGetDoc`). Its 5 runs took 5–6 min each instead of 2.1. Microsoft Defender (`epsext`, `wdavdaemon`) was using a lot of CPU, and the load average was about 28 on 12 cores, so these runs aren't comparable with the ones above. Results: 2, 2, 0, 3 and 3 failures. None of them was the "View session" failure, so the probe never ran. What failed instead:

- **Most failures:** `startSession` (`e2e/emulator/sessions.ts:52`), where the click on "Start session" hit the 30 s test timeout. Mostly webkit-mobile-emulator; once directly in `delete-account.spec.ts:142`.
- **A possible app bug:** in run 5, starting a Session for chromium-mobile-emulator `shared-sessions.spec.ts:51` failed with "This club already has an active session" (`NewSessionScreen.tsx:463`, `session-exists`). Every test uses its own Club, so nothing else can have started a Session there. One guess is that the start write was retried under load and the retry found the first attempt's Session. Not investigated yet.
- **Out of memory again:** "browser.newContext: Target page, context or browser has been closed" in run 4.

The diagnostics were taken out again; only the Account fix stays.

**Next steps**

- Cap the emulator projects with per-project `workers` (Playwright 1.63 supports this on `TestProject`), e.g. 1–2 each. Then repeat the 3-run check on a quiet machine, without Defender scanning.
- Look into the `session-exists` failure as a possible double start under slow writes. It is worth a separate ticket if it can be reproduced.
- If "View session" fails again, use the passive probe (it reads Playwright's buffered `consoleMessages`/`requests`/`pageErrors` only after the failure) rather than `page.on` listeners.
