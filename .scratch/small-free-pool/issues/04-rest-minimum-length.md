# Decision needed: should a Rest have a minimum length?

Status: needs-triage
Type: grilling

Vocabulary per `GLOSSARY.md`. Rule order per ADR-0009.

## Problem

A Rest is "a Match starting without a Session player while that player was free to play and not in another Court's Lineup". It has no length. If a player finishes and another Court starts a Match seconds later without them, that counts as a full Rest and resets their Streak, even if their own next Match starts a minute later.

## Evidence (sweep, `../sweep.test.ts.txt` Section 3, with the ticket-01 fix)

The test setup: Courts started together, Matches of 12–18 min, and the host taking 0–2 min to press Start. In that setup, real runs without a break (next Match starting within ~3 min of the last) averaged about 4–7 Matches with 2–3 Spare players. Over the same runs, the Streak averaged 2.7–3.8. The Rest limit therefore protects players less than the Streak suggests whenever Courts finish close together. The "within ~3 min" threshold is the sweep's own approximation.

## Options to grill

- Keep it as it is: a Rest is about who was picked, not how long someone waited.
- A Rest only counts if the player's Wait reaches some minimum before their next Match starts.
- A Rest only counts if a whole Match goes by without them, start to end.

Any change alters what Streak means, the Rest rule tests in `simulation.test.ts`, and probably the ADR-0009 rule order. Expect an ADR.

## E2E workflows

To be decided. Probably `None — pure domain logic`.
