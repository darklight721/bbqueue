# Bug (suspected): Rehash's single-player swap can break the Rest limit

Status: needs-triage
Type: task

Vocabulary per `GLOSSARY.md`.

## Problem

When the only allowed set of four is the current Lineup, `pickDifferentLineup` falls back to the best single-player swap (`src/domain/engine/select.ts:364-379`). `swapKey` ranks swaps by Rest key and "passed over" count, but nothing stops it from bringing in a player who would then play a third Match in a row.

## Evidence (sweep, `../sweep.test.ts.txt`, not instrumented)

At 1 Spare player (9 on 2 Courts, 13 on 3), pressing Rehash on each repeated Lineup raised the longest Streak from 4–5 to 11–12. The cause is inferred from the code; it hasn't been traced pick by pick.

## Expected

To decide: Rehash either never makes a Lineup that breaks Rest when the current one doesn't, or the organiser is told that a different Lineup would break Rest.

## First step

Write a minimal failing unit test that reproduces the swap breaking Rest, before changing anything.

## E2E workflows

None — pure domain logic, covered by unit tests.
