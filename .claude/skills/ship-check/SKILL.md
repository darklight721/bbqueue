---
name: ship-check
description: Pre-commit gate for bbqueue. Checks the change against the "done" rules in AGENTS.md and runs every check it needs, then reports what's green and what's red.
disable-model-invocation: true
---

Gate the current change before it's committed. The rules come from the "Testing" section of `AGENTS.md`; this skill is how you prove each one. Check and report only: leave committing to the user.

## Shell setup

`pnpm e2e` starts its web servers with `pnpm exec`, and the emulators need `java`, so both must be on `PATH` in the shell that runs the checks. If `pnpm` isn't found, look in `~/Library/pnpm/bin` (or use `corepack pnpm`) and export that directory onto `PATH`. For Java, see "Java and the Firebase emulators" in `README.md`. Run commands longer than ~2 minutes in the background.

## Steps

1. **Scope.** List the change: `git diff HEAD --stat` plus untracked files from `git status --porcelain`. Sort the files into: domain (`src/domain/**`), UI/app, backend (`src/backend/**`), `firestore.rules`, e2e specs (`e2e/**`), `.scratch` docs. Done when every changed file is in a bucket.

2. **Feature docs.** Find the `.scratch/<feature>/` this change belongs to (from the diff, the branch, or ask). Its `spec.md` and every ticket under `issues/` that the change implements has an `## E2E workflows` section, either listing workflows or `None — <reason>`. Done when each one is checked.

3. **Reviews.** In one message, dispatch the `e2e-gap-reviewer` subagent on the change, and, if `firestore.rules` or `src/backend/firebase*.ts` changed, the `rules-security-reviewer` subagent too. Carry their verdicts and findings into the report as they are.

4. **Static and unit.** Run `pnpm check` and `pnpm test`. Done when both pass, or each failure is captured.

5. **Firebase.** If the backend or rules buckets are non-empty, run `pnpm test:firebase`.

6. **Touched specs.** For each changed or new spec file, run `pnpm e2e e2e/<file>.spec.ts`. The config runs it on both of its projects (`chromium-mobile` + `webkit-mobile`, or the two `-emulator` projects for `e2e/emulator/`); confirm both projects appear in the output.

7. **Full suite.** Run `pnpm e2e`. Done when it passes, or every failing test is listed with its project.

8. **Commit shape.** If the e2e test that covers this change is missing from the change itself (planned for a later `test:` commit, or only in an earlier commit), mark it red: the test lands in the same commit as the feature or fix.

## Report

A checklist with one line per step, each **green**, **red** or **skipped (why)**. Under each red line, the failing command's relevant output or the reviewer's findings. End with one line: **Ready to commit**, or the list of what blocks it.
