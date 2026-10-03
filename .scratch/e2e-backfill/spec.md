# Spec: E2E backfill for recent features

Status: done

Several recent features and fixes shipped with unit tests only. This spec adds the missing Playwright coverage (see "Testing" in `AGENTS.md`). No app code changes; if a test exposes a real bug, stop and report it rather than changing app code.

## E2E workflows

### G1 — Ended sessions list filtered by Club (`/sessions`, commit af58b9a) → new `e2e/ended-sessions.spec.ts`

- The Club filter only appears when there are enough choices (see `src/features/past-sessions/clubFilter.ts`); with Ended sessions from a single Club it is hidden.
- Choosing a Club narrows the list to that Club's Ended sessions; "No club" (`?club=none`) shows guest-only sessions.
- The choice is reflected in the URL (`?club=<id|none>`) and survives a reload.
- Opening an Ended session from a filtered list and pressing Back returns to the filtered list.

### G2 — Club sessions list (`/clubs/:clubId/sessions`, commit af58b9a) → `e2e/ended-sessions.spec.ts`

- Edit club shows a Sessions link (with its count) for a Club that has Ended sessions; it opens `/clubs/:clubId/sessions`.
- The list shows only that Club's Ended sessions, titled with the Club name.
- Opening an Ended session from it, Back returns to the club sessions list; Back from the list returns to Edit club.
- An unknown club id redirects (assert the actual redirect target in the code).

### G3 — Club name under the title (commit af58b9a) → existing spec per screen

- Live Session screen shows the Club name (`e2e/session-*.spec.ts`, whichever fits best).
- Ended session details show the Club name (`e2e/ended-sessions.spec.ts`).
- Session summary shows the Club name (`e2e/session-summary.spec.ts`).
- A guests-only Session shows no Club line.
- If the Club was renamed after the Session, assert whatever `displayClubName` (`src/domain/clubName.ts`) decides.

### G4 — Enter adds the next player (commit 51ddeda) → `e2e/club-edit.spec.ts`, `e2e/session-players.spec.ts`

- Edit club: typing a name in the add-player field and pressing Enter adds the player and leaves the field empty and focused for the next one.
- Live Session add-player form: same behaviour.
- Mirror the existing New session guest test (`e2e/new-session.spec.ts:234`), including the duplicate-name rejection where applicable.

### G5 — Score field not auto-focused on End match (commit 387d503) → `e2e/session-courts.spec.ts`

- Opening the End match dialog does not focus either score field (no keyboard pops up on phones).

## Out of scope

- G6 PWA update prompt (needs two builds and a simulated service-worker update; unit-tested in `UpdatePrompt.test.tsx`).
- G7 scroll reset (already one e2e case; low risk).
- Skill badges and other purely visual changes.

## Acceptance

- New and changed spec files pass on `chromium-mobile` and `webkit-mobile`.
- Full `pnpm e2e` passes.
- `pnpm check` passes (types and lint, including `tsconfig.e2e.json`).
