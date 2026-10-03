## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Testing

### E2E specs are part of done

Playwright specs live in `e2e/` (`pnpm e2e`; projects `chromium-mobile` and `webkit-mobile`). Seed state with `e2e/fixtures.ts` and drive sessions with `e2e/session-helpers.ts`.

When implementing a feature or fixing a bug, add or update an e2e test whenever the behaviour can't be credibly proven by unit tests (Vitest + jsdom):

- navigation between screens, Back targets, redirects, URL params
- persistence across a reload (localStorage)
- real keyboard and focus behaviour (Enter, autofocus, iOS keyboard)
- browser-specific behaviour (WebKit vs Chromium)
- offline / PWA, image share, confirm-dialog flows
- **every new screen or route gets at least one e2e workflow test**

Exempt: pure domain logic (`src/domain/**`, covered by unit tests) and purely visual tweaks (spacing, line height, icons, badge styling).

Rules:

- The e2e test lands in the **same commit** as the feature or fix, not in a later `test:` commit.
- While iterating, run the touched spec files on both projects (`pnpm e2e e2e/<file>.spec.ts`). Before committing, the full `pnpm e2e` must pass.
- Every `.scratch/<feature>/spec.md` (and each issue ticket) has an `## E2E workflows` section listing the workflows the e2e tests must cover, or `None — <reason>` if the change is exempt.
- One spec file per screen area; name files with glossary terms (e.g. `ended-sessions.spec.ts`, not `past-sessions`).
