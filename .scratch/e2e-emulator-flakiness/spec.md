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
